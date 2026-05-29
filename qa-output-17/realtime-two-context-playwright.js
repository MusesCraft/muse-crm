const { chromium } = require('playwright');
const { io } = require('../frontend/node_modules/socket.io-client');
const fs = require('fs');
const path = require('path');

const OUT = process.env.QA_OUT || path.resolve(__dirname, 'realtime-two-context-playwright-results.json');
const FRONT = process.env.QA_FRONT || 'https://frontend-production-0866.up.railway.app';
const API = process.env.QA_API || 'https://backend-production-5171.up.railway.app/api/v1';
const SOCKET_BASE = API.replace(/\/api\/v[0-9]+\/?$/, '');
const EMAIL = process.env.QA_EMAIL || 'admin@muse-crm.com';
const PASSWORD = process.env.QA_PASSWORD || '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();
const result = {
  env: { FRONT, API, SOCKET_BASE, EMAIL },
  started_at: nowIso(),
  steps: [],
  socket_events: [],
  console: [],
  failed_requests: [],
};

function step(name, status, details = {}) {
  result.steps.push({ name, status, at: nowIso(), ...details });
  console.log(`[${status}] ${name}`, details);
}

async function api(pathname, opts = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${pathname} HTTP ${res.status}: ${text.slice(0, 500)}`);
  return data;
}

async function seedContext(browser, token) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, baseURL: FRONT });
  await context.addInitScript((value) => {
    window.localStorage.setItem('muse_token', value);
  }, token);
  const page = await context.newPage();
  page.on('console', (msg) => result.console.push({ page: page._guid, type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => result.console.push({ page: page._guid, type: 'pageerror', text: err.message }));
  page.on('requestfailed', (req) => result.failed_requests.push({
    page: page._guid,
    url: req.url(),
    method: req.method(),
    failure: req.failure()?.errorText,
  }));
  return { context, page };
}

async function openInboxAndSelect(page, conversation) {
  await page.goto('/inbox', { waitUntil: 'networkidle' });
  const teamButton = page.getByRole('button', { name: '團隊視圖' });
  if (await teamButton.count()) {
    await teamButton.first().click();
    await page.waitForTimeout(1000);
  }

  const labels = [
    conversation.contact?.display_name,
    conversation.contact?.name,
    conversation.contact_name,
    conversation.display_name,
  ].filter(Boolean);

  for (const label of labels) {
    const locator = page.getByText(label, { exact: false });
    if (await locator.count()) {
      await locator.first().click();
      await page.waitForTimeout(1000);
      return label;
    }
  }

  const fallback = page.locator('button, [role="button"], [class*="cursor-pointer"]').filter({ hasText: /LINE|Messenger|Instagram|Telegram|客戶|設計|詢價/ });
  if (await fallback.count()) {
    await fallback.first().click();
    await page.waitForTimeout(1000);
    return 'fallback';
  }

  throw new Error('Unable to select target conversation in inbox UI');
}

async function main() {
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const token = login.token || login.access_token || login.data?.token;
  if (!token) throw new Error('login succeeded but token missing');
  step('API login', 'PASS', { token_prefix: token.slice(0, 10) });

  const conversations = await api('/inbox/conversations?page=1&per_page=20&view=team', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const target = (conversations.data || []).find((conv) => conv.status !== 'closed') || conversations.data?.[0];
  if (!target) throw new Error('no conversation available for realtime test');
  step('Fetch target conversation', 'PASS', {
    conversation_id: target.id,
    contact_id: target.contact_id || target.contact?.id,
    contact_name: target.contact?.display_name || target.contact?.name,
    channel: target.channel,
    status: target.status,
  });

  const socket = io(`${SOCKET_BASE}/notifications`, {
    transports: ['websocket', 'polling'],
    auth: { token },
    query: { auth: token },
    reconnection: false,
    timeout: 10000,
  });
  socket.onAny((event, data) => result.socket_events.push({ event, at: nowIso(), data }));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('/notifications socket connect timeout')), 12000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  step('Socket.io connect /notifications', 'PASS', { socket_id: socket.id, transports: ['websocket', 'polling'] });

  const browser = await chromium.launch({ headless: true });
  const a = await seedContext(browser, token);
  const b = await seedContext(browser, token);

  const selectedA = await openInboxAndSelect(a.page, target);
  const selectedB = await openInboxAndSelect(b.page, target);
  step('Open two browser contexts and select same conversation', 'PASS', { selectedA, selectedB });

  const marker = `QA realtime ${Date.now()}`;
  const beforeSocketEvents = result.socket_events.length;
  await a.page.getByRole('button', { name: /切到內部備註|內部備註模式/ }).first().click();
  await a.page.getByLabel('輸入訊息').fill(marker);
  const responsePromise = a.page.waitForResponse((res) =>
    res.url().includes(`/inbox/conversations/${target.id}/send`) && res.request().method() === 'POST',
    { timeout: 10000 },
  );
  await a.page.locator('button[title="發送"]').click();
  const sendResponse = await responsePromise;
  step('Context A sends internal message', sendResponse.ok() ? 'PASS' : 'FAIL', {
    status: sendResponse.status(),
    marker,
  });

  const detailUpdated = await b.page.getByText(marker, { exact: false }).waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  step('Context B sees message within 3 seconds', detailUpdated ? 'PASS' : 'FAIL', { marker });

  await sleep(800);
  const emittedAfterSend = result.socket_events.slice(beforeSocketEvents).map((event) => event.event);
  step('Socket receives new_message after send', emittedAfterSend.includes('new_message') ? 'PASS' : 'FAIL', {
    events: emittedAfterSend,
  });

  await b.page.screenshot({ path: path.resolve(__dirname, 'realtime-two-context-after-send.png'), fullPage: true });
  result.finished_at = nowIso();
  await a.context.close();
  await b.context.close();
  await browser.close();
  socket.disconnect();

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`Wrote ${OUT}`);
  if (!detailUpdated || !emittedAfterSend.includes('new_message') || !sendResponse.ok()) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  result.error = err.stack || String(err);
  result.finished_at = nowIso();
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.error(err);
  process.exit(1);
});
