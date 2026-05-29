const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONT = process.env.QA_FRONT || 'https://frontend-production-0866.up.railway.app';
const API = process.env.QA_API || 'https://backend-production-5171.up.railway.app/api/v1';
const EMAIL = process.env.QA_EMAIL || 'admin@muse-crm.com';
const PASSWORD = process.env.QA_PASSWORD || '';
const OUT = '/Users/muse/Developer/muse-crm/qa-output-17';
const SHOTS = path.join(OUT, 'screenshots-ai-tone');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const issues = [];
const apiEvents = [];
const consoleEvents = [];
const artifacts = [];
const log = (area, step, status, detail = '') => {
  results.push({ area, step, status, detail });
  console.log(`${status} [${area}] ${step} ${detail}`);
};
const issue = (severity, area, title, detail, artifact = null) => {
  issues.push({ severity, area, title, detail, artifact });
  console.log(`ISSUE ${severity} [${area}] ${title}: ${detail}`);
};
const shot = async (page, name) => {
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  artifacts.push(p);
  return p;
};
async function api(pathname, opts = {}, token = null) {
  const res = await fetch(`${API}${pathname}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}
function redact(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => k.toLowerCase().includes('token') ? '<redacted>' : v));
}

(async () => {
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  if (!login.ok) throw new Error(`API login failed: ${login.status} ${JSON.stringify(login.body).slice(0, 300)}`);
  const token = login.body.token;
  const refreshToken = login.body.refresh_token;
  log('API Auth', 'login', 'PASS', JSON.stringify(redact(login.body.user || {})));

  const list = await api('/inbox/conversations?per_page=20&view=team', {}, token);
  log('API Inbox', 'list conversations', list.ok ? 'PASS' : 'FAIL', `${list.status}; total=${list.body?.pagination?.total}`);
  if (!list.ok || !Array.isArray(list.body?.data) || list.body.data.length === 0) {
    issue('Critical', 'API Inbox', 'No conversations available for AI analysis QA', `status=${list.status}`);
    throw new Error('No conversations');
  }
  const conv = list.body.data.find(c => (c.message_count || 0) > 0) || list.body.data[0];
  log('Scope', 'selected conversation', 'PASS', `conversation=${conv.id}; contact=${conv.contact?.display_name || conv.contact?.name}; messages=${conv.message_count}; status=${conv.status}`);

  const before = await api(`/inbox/conversations/${conv.id}`, {}, token);
  log('API Detail', 'before analyze', before.ok ? 'PASS' : 'FAIL', `${before.status}; analyses=${before.body?.analyses?.length ?? 'n/a'}; messages=${before.body?.messages?.length ?? 'n/a'}`);
  if (before.ok && (before.body?.messages || []).length === 0) {
    issue('High', 'API Analyze', 'Conversation has no messages but list claimed usable', `conversation=${conv.id}`);
  }

  const analyze = await api(`/inbox/conversations/${conv.id}/analyze`, { method: 'POST', body: '{}' }, token);
  log('API Analyze', 'manual trigger', analyze.status === 202 ? 'PASS' : 'FAIL', `${analyze.status}; ${JSON.stringify(redact(analyze.body)).slice(0, 250)}`);
  if (analyze.status !== 202) issue('High', 'API Analyze', 'Manual analysis trigger failed', `${analyze.status}: ${JSON.stringify(analyze.body).slice(0, 500)}`);

  let after = null;
  const beforeCount = before.body?.analyses?.length || 0;
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 2500));
    after = await api(`/inbox/conversations/${conv.id}`, {}, token);
    const count = after.body?.analyses?.length || 0;
    if (after.ok && count > beforeCount) break;
  }
  const afterCount = after?.body?.analyses?.length || 0;
  log('API Analyze', 'poll persisted analysis', afterCount > beforeCount ? 'PASS' : 'WARN', `before=${beforeCount}; after=${afterCount}`);
  if (!(afterCount > beforeCount)) {
    issue('High', 'API Analyze', 'Analysis task accepted but no new analysis became visible within 20s', `task=${analyze.body?.task_id || 'n/a'}; conversation=${conv.id}`);
  }
  const latest = (after?.body?.analyses || [])[0] || (before.body?.analyses || [])[0] || null;
  if (latest) {
    const validSentiment = ['positive', 'neutral', 'negative'].includes(latest.sentiment);
    log('API Analyze', 'sentiment schema', validSentiment ? 'PASS' : 'WARN', `sentiment=${latest.sentiment}; urgency=${latest.urgency}; model=${latest.model_used}`);
    if (!validSentiment) issue('Medium', 'API Analyze', 'Latest analysis sentiment is empty or outside allowed enum', JSON.stringify(redact(latest)).slice(0, 600));
  } else {
    issue('High', 'API Analyze', 'No existing or new analysis data to validate sentiment', `conversation=${conv.id}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'zh-TW' });
  await context.addInitScript(({ token, refreshToken }) => {
    localStorage.setItem('muse_token', token);
    localStorage.setItem('muse_refresh_token', refreshToken);
  }, { token, refreshToken });
  const page = await context.newPage();
  page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) consoleEvents.push({ type: msg.type(), text: msg.text() }); });
  page.on('pageerror', err => consoleEvents.push({ type: 'pageerror', text: err.message || String(err) }));
  page.on('response', r => { if (r.url().includes('/api/v1/')) apiEvents.push({ method: r.request().method(), status: r.status(), url: r.url() }); });

  await page.goto(`${FRONT}/inbox`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  let text = await page.locator('body').innerText({ timeout: 10000 }).catch(e => '');
  const inboxShot = await shot(page, '01-inbox-loaded');
  log('Browser Inbox', 'load', text.includes('AI') || text.includes('對話') || text.includes('收件') ? 'PASS' : 'WARN', page.url());
  if (/登入|Email|密碼/.test(text)) issue('High', 'Browser Auth', 'Token injection did not authenticate browser session', text.slice(0, 200), inboxShot);

  const contactName = conv.contact?.display_name || conv.contact?.name;
  if (contactName && await page.getByText(contactName, { exact: false }).first().isVisible().catch(() => false)) {
    await page.getByText(contactName, { exact: false }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  text = await page.locator('body').innerText().catch(() => '');
  const detailShot = await shot(page, '02-conversation-detail');
  log('Browser Detail', 'conversation/contact visible', contactName && text.includes(contactName) ? 'PASS' : 'WARN', contactName || 'unknown contact');

  const analyzeButton = page.getByRole('button', { name: /深度分析|分析中/ }).first();
  const hasAnalyzeButton = await analyzeButton.count().then(c => c > 0).catch(() => false);
  log('Browser AI', 'analyze button present', hasAnalyzeButton ? 'PASS' : 'WARN', '深度分析 button');
  if (hasAnalyzeButton) {
    const beforeText = await page.locator('body').innerText().catch(() => '');
    const responsePromise = page.waitForResponse(r => r.url().includes(`/inbox/conversations/`) && r.url().includes('/analyze'), { timeout: 12000 }).catch(() => null);
    await analyzeButton.click({ force: true }).catch(e => issue('Medium', 'Browser AI', 'Click deep analysis failed', e.message));
    const resp = await responsePromise;
    await page.waitForTimeout(3200);
    const afterText = await page.locator('body').innerText().catch(() => '');
    const aiShot = await shot(page, '03-after-deep-analysis-click');
    log('Browser AI', 'analyze POST captured', resp && resp.status() === 202 ? 'PASS' : 'WARN', resp ? `${resp.status()} ${resp.url()}` : 'no response captured');
    const showsStaticMock = afterText.includes('客戶正在詢問產品規格與報價，有明確購買意向') && afterText.includes('Laminam');
    log('Browser AI', 'post-click displayed analysis', afterText !== beforeText && /需求摘要|正面|中性|負面|緊急度|建議動作/.test(afterText) ? 'PASS' : 'WARN', 'AI panel changed/displayed');
    if (showsStaticMock) issue('High', 'Browser AI', 'Deep analysis UI displays hard-coded mock result after API submit', 'Detected fixed copy: 客戶正在詢問產品規格與報價、有明確購買意向 / Laminam / 正面 / medium. UI is not proving real backend LLM result.', aiShot);
  } else if (!/正面|中性|負面|需求摘要|AI 分析/.test(text)) {
    issue('Medium', 'Browser AI', 'Neither analysis result nor deep analysis button visible', 'AI analysis area could not be exercised', detailShot);
  }

  const badApi = apiEvents.filter(e => e.status >= 400 && !e.url.includes('/auth/refresh'));
  if (badApi.length) issue('High', 'Browser API', '4xx/5xx API responses during browser QA', JSON.stringify(badApi.slice(0, 20), null, 2));
  if (consoleEvents.length) issue('Medium', 'Browser Console', 'Console warnings/errors during browser QA', JSON.stringify(consoleEvents.slice(0, 20), null, 2));

  const report = { timestamp: new Date().toISOString(), scope: { FRONT, API, conversation_id: conv.id, contact: contactName }, results, issues, apiEvents, consoleEvents, artifacts };
  const reportPath = path.join(OUT, 'ai-tone-analysis-qa-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(redact(report), null, 2));
  await browser.close();
  console.log(`QA_RESULTS=${reportPath}`);
})();
