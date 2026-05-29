const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname);
const FRONTEND = 'https://frontend-production-0866.up.railway.app';
const BACKEND = 'https://backend-production-5171.up.railway.app/api/v1';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL: FRONTEND });
  await context.addInitScript(() => window.localStorage.clear());
  let page = await context.newPage();
  const consoleMessages = [];
  const failedRequests = [];
  const apiResponses = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleMessages.push({ type: 'pageerror', text: err.message }));
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText }));
  page.on('response', res => {
    const url = res.url();
    if (url.includes('/api/v1/')) apiResponses.push({ url, status: res.status(), method: res.request().method() });
  });

  // Use API login first, then seed localStorage. This avoids React hydration/login form races.
  const loginResForUi = await context.request.post(`${BACKEND}/auth/login`, { data: { email: 'admin@muse-crm.com', password: process.env.QA_PASSWORD || '' } });
  const loginJsonForUi = await loginResForUi.json();
  const uiToken = loginJsonForUi.token || loginJsonForUi.access_token;
  const uiUser = loginJsonForUi.user;
  await page.close();
  await context.addInitScript(({ token, refresh }) => {
    window.localStorage.setItem('muse_token', token);
    if (refresh) window.localStorage.setItem('muse_refresh_token', refresh);
  }, { token: uiToken, refresh: loginJsonForUi.refresh_token });
  page = await context.newPage();
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleMessages.push({ type: 'pageerror', text: err.message }));
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText }));
  page.on('response', res => {
    const url = res.url();
    if (url.includes('/api/v1/')) apiResponses.push({ url, status: res.status(), method: res.request().method() });
  });
  await page.goto('/inbox', { waitUntil: 'networkidle' });
  // Default view is "我的對話" and may be empty for admin. Switch to team view for available fixtures.
  const teamButton = page.getByRole('button', { name: '團隊視圖' });
  if (await teamButton.count()) {
    await teamButton.click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: path.join(OUT, 'bot-buttons-inbox-initial.png'), fullPage: true });

  // Wait for conversation list/detail if data exists.
  await page.waitForTimeout(2000);
  const buttonsInitial = await page.locator('button').evaluateAll(btns => btns.map((b, i) => ({
    i,
    text: (b.innerText || b.getAttribute('aria-label') || b.getAttribute('title') || '').trim(),
    title: b.getAttribute('title'),
    aria: b.getAttribute('aria-label'),
    disabled: b.disabled,
    visible: !!(b.offsetWidth || b.offsetHeight || b.getClientRects().length),
  })).filter(b => b.visible));

  // Select first visible conversation/card in the list if present.
  const convCandidates = page.locator('[class*="cursor-pointer"], [role="button"]');
  const convCount = await convCandidates.count();
  if (convCount > 0) {
    // Avoid sidebar/nav buttons by clicking a candidate containing customer/channel hints if possible.
    const candidateTexts = await convCandidates.evaluateAll(els => els.map((el, idx) => ({ idx, text: (el.innerText || '').trim().slice(0, 200) })));
    const found = candidateTexts.find(x => /Messenger|Instagram|LINE|王|客戶|設計|詢價|active|待/.test(x.text)) || candidateTexts[0];
    await convCandidates.nth(found.idx).click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: path.join(OUT, 'bot-buttons-conversation-detail.png'), fullPage: true });

  // Probe quick replies / suggested reply buttons without sending.
  const probeResults = [];
  for (const name of ['溫和回覆', '報價說明', '邀約丈量']) {
    const btn = page.getByRole('button', { name });
    const count = await btn.count();
    if (count) {
      await btn.first().click();
      await page.waitForTimeout(300);
      const value = await page.getByLabel('輸入訊息').inputValue().catch(async () => await page.locator('textarea').first().inputValue().catch(() => ''));
      probeResults.push({ button: name, present: true, filledComposer: value.length > 0, composerSample: value.slice(0, 80) });
    } else {
      probeResults.push({ button: name, present: false });
    }
  }

  const quick = page.locator('button[title="預存語錄"]').first();
  const quickExists = await quick.count();
  if (quickExists) {
    await quick.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'bot-buttons-quick-replies-panel.png'), fullPage: true });
  }

  const textsAfter = await page.locator('body').innerText();
  const botButtonTerms = ['機器人', 'Bot', 'bot', 'callback', 'inline keyboard', '互動按鈕', 'WebApp', '按鈕回覆'];
  const termPresence = Object.fromEntries(botButtonTerms.map(t => [t, textsAfter.includes(t)]));
  const buttonTextsAfter = await page.locator('button').evaluateAll(btns => btns.map((b, i) => ({
    i,
    text: (b.innerText || b.getAttribute('aria-label') || b.getAttribute('title') || '').trim(),
    title: b.getAttribute('title'),
    aria: b.getAttribute('aria-label'),
    disabled: b.disabled,
    visible: !!(b.offsetWidth || b.offsetHeight || b.getClientRects().length),
  })).filter(b => b.visible));

  // API probes: telegram conversations and unsupported send type validation on an existing conversation.
  const loginRes = await context.request.post(`${BACKEND}/auth/login`, { data: { email: 'admin@muse-crm.com', password: process.env.QA_PASSWORD || '' } });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.access_token;
  const headers = { Authorization: `Bearer ${token}` };
  const allConvRes = await context.request.get(`${BACKEND}/inbox/conversations?per_page=5`, { headers });
  const tgConvRes = await context.request.get(`${BACKEND}/inbox/conversations?channel=telegram&per_page=5`, { headers });
  const allConvJson = await allConvRes.json();
  const tgConvJson = await tgConvRes.json();
  let unsupportedSend = null;
  const firstConv = allConvJson.data?.[0];
  if (firstConv?.id) {
    const res = await context.request.post(`${BACKEND}/inbox/conversations/${firstConv.id}/send`, {
      headers,
      data: { message_type: 'callback_query', content: 'qa-probe-bot-button', is_internal: true },
    });
    unsupportedSend = { status: res.status(), body: await res.text(), conversationId: firstConv.id };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    urls: { frontend: FRONTEND, backend: BACKEND },
    buttonsInitial,
    buttonTextsAfter,
    probeResults,
    quickRepliesPanelOpened: !!quickExists,
    termPresence,
    api: {
      allConversationsStatus: allConvRes.status(),
      allConversationCount: allConvJson.data?.length ?? null,
      telegramConversationsStatus: tgConvRes.status(),
      telegramConversationCount: tgConvJson.data?.length ?? null,
      unsupportedSend,
    },
    network: { failedRequests, apiResponses },
    consoleMessages,
    artifacts: [
      'bot-buttons-inbox-initial.png',
      'bot-buttons-conversation-detail.png',
      quickExists ? 'bot-buttons-quick-replies-panel.png' : null,
    ].filter(Boolean),
  };
  fs.writeFileSync(path.join(OUT, 'bot-interaction-buttons-playwright.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
