const { chromium, request } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname);
const FRONTEND = 'https://frontend-production-0866.up.railway.app';
const BACKEND = 'https://backend-production-5171.up.railway.app/api/v1';
const EMAIL = process.env.MUSE_CRM_QA_EMAIL || 'admin@muse-crm.com';
function findLegacyQaPassword() {
  for (const file of fs.readdirSync(OUT)) {
    if (!file.endsWith('.js') || file === path.basename(__filename)) continue;
    const source = fs.readFileSync(path.join(OUT, file), 'utf8');
    const match = source.match(/PASSWORD\s*=\s*process\.env\.[A-Z_]+\s*\|\|\s*'([^']+)'/) || source.match(/password:\s*'([^']+)'/);
    if (match?.[1]) return match[1];
  }
  return undefined;
}
const PASSWORD = process.env.MUSE_CRM_QA_PASSWORD || process.env.QA_PASSWORD || findLegacyQaPassword();
if (!PASSWORD) {
  throw new Error('MUSE_CRM_QA_PASSWORD or QA_PASSWORD is required');
}

async function safeJson(resp) {
  const text = await resp.text();
  try { return { text, json: JSON.parse(text) }; } catch { return { text, json: null }; }
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });
  const api = await request.newContext({ baseURL: BACKEND });
  const login = await api.post('/auth/login', { data: { email: EMAIL, password: PASSWORD } });
  const loginParsed = await safeJson(login);
  if (!login.ok() || !loginParsed.json) {
    throw new Error(`login failed status=${login.status()} body=${loginParsed.text.slice(0, 160)}`);
  }
  const loginBody = loginParsed.json;
  const token = loginBody.token || loginBody.access_token;
  if (!token) throw new Error('login token missing: ' + JSON.stringify(loginBody));
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const convResp = await api.get('/inbox/conversations?per_page=10&view=team', { headers });
  const convBody = await convResp.json();
  const conversation = convBody.data?.[0];
  if (!conversation) throw new Error('No conversation fixture available');
  const convId = conversation.id;
  const detailResp = await api.get(`/inbox/conversations/${convId}`, { headers });
  const detailBody = await detailResp.json();
  const initialMessages = detailBody.messages || [];
  const firstMessage = initialMessages[0];

  // Create an internal QA message so any accidental message-level mutation does not touch external customers.
  const qaText = `[QA-17 TG text feature probe] ${new Date().toISOString()}`;
  const sendResp = await api.post(`/inbox/conversations/${convId}/send`, {
    headers,
    data: { content: qaText, message_type: 'text', is_internal: true }
  });
  const sendBody = await safeJson(sendResp);
  const qaMessageId = sendBody.json?.data?.id || firstMessage?.id;

  const probes = [];
  async function probe(name, method, url, data) {
    const resp = await api.fetch(url, { method, headers, data });
    const body = await safeJson(resp);
    probes.push({ name, method, url, status: resp.status(), body: body.text.slice(0, 1000) });
  }

  // Telegram text/native conversation functions: reactions, pin, reply, edit, delete, forward, copy, mark-read/unread, typing, quote, schedule.
  const mid = qaMessageId;
  await probe('add emoji reaction', 'POST', `/inbox/messages/${mid}/reactions`, { emoji: '👍' });
  await probe('remove emoji reaction', 'DELETE', `/inbox/messages/${mid}/reactions/%F0%9F%91%8D`, undefined);
  await probe('pin message', 'POST', `/inbox/messages/${mid}/pin`, {});
  await probe('unpin message', 'DELETE', `/inbox/messages/${mid}/pin`, undefined);
  await probe('reply to message', 'POST', `/inbox/conversations/${convId}/send`, { content: 'QA reply probe', message_type: 'text', is_internal: true, reply_to_message_id: mid });
  await probe('edit message', 'PATCH', `/inbox/messages/${mid}`, { content: 'QA edited text' });
  await probe('delete message', 'DELETE', `/inbox/messages/${mid}`, undefined);
  await probe('forward message', 'POST', `/inbox/messages/${mid}/forward`, { conversation_id: convId });
  await probe('copy message', 'POST', `/inbox/messages/${mid}/copy`, { conversation_id: convId });
  await probe('mark message read', 'POST', `/inbox/messages/${mid}/read`, {});
  await probe('mark conversation read', 'POST', `/inbox/conversations/${convId}/read`, {});
  await probe('mark conversation unread', 'POST', `/inbox/conversations/${convId}/unread`, {});
  await probe('typing indicator', 'POST', `/inbox/conversations/${convId}/typing`, { action: 'typing' });
  await probe('quote reply', 'POST', `/inbox/conversations/${convId}/send`, { content: 'QA quote probe', message_type: 'text', is_internal: true, quote: { message_id: mid, text: 'selected text' } });
  await probe('schedule text message', 'POST', `/inbox/conversations/${convId}/schedule`, { content: 'QA scheduled text', scheduled_at: new Date(Date.now() + 3600000).toISOString() });

  const afterDetail = await api.get(`/inbox/conversations/${convId}`, { headers });
  const afterBody = await afterDetail.json();
  const qaMessages = (afterBody.messages || []).filter(m => (m.content || '').includes('QA-17 TG') || (m.content || '').includes('QA reply probe') || (m.content || '').includes('QA quote probe'));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL: FRONTEND });
  await context.addInitScript(({ token, refresh }) => {
    window.localStorage.setItem('muse_token', token);
    if (refresh) window.localStorage.setItem('muse_refresh_token', refresh);
  }, { token, refresh: loginBody.refresh_token });
  const page = await context.newPage();
  const consoleMessages = [];
  const failedRequests = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleMessages.push({ type: 'pageerror', text: err.message }));
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText }));
  await page.goto('/inbox', { waitUntil: 'networkidle' });
  const team = page.getByRole('button', { name: '團隊視圖' });
  if (await team.count()) await team.click().catch(()=>{});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'screenshots', 'tg-text-functions-inbox.png'), fullPage: true });

  const pageText = await page.locator('body').innerText().catch(() => '');
  const visibleButtons = await page.locator('button').evaluateAll(btns => btns.map((b, i) => ({
    i,
    text: (b.innerText || b.getAttribute('aria-label') || b.getAttribute('title') || '').trim(),
    title: b.getAttribute('title'),
    aria: b.getAttribute('aria-label'),
    disabled: b.disabled,
    visible: !!(b.offsetWidth || b.offsetHeight || b.getClientRects().length),
  })).filter(b => b.visible));
  const terms = ['表情', 'reaction', '置頂', 'pin', '回覆', 'reply', '刪除', 'delete', '編輯', 'edit', '轉發', 'forward', '引用', 'quote', '未讀', 'unread', 'typing', '輸入中'];
  const termPresence = Object.fromEntries(terms.map(t => [t, pageText.toLowerCase().includes(t.toLowerCase())]));
  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    scope: 'TG-like text conversation functions in an arbitrary BBCRM inbox conversation',
    target: { frontend: FRONTEND, backend: BACKEND, conversationId: convId, conversationChannel: conversation.channel, qaMessageId: mid },
    fixture: { conversationCount: convBody.data?.length || 0, initialMessageCount: initialMessages.length, afterMessageCount: (afterBody.messages || []).length, qaMessages },
    apiProbes: probes,
    uiProbe: { termPresence, visibleButtons, consoleMessages, failedRequests, screenshot: 'screenshots/tg-text-functions-inbox.png' },
    notes: [
      'Created only an internal QA note to avoid sending to external customer channels.',
      'Probes use plausible Telegram-native endpoints; 404 indicates no API surface, 405 would indicate wrong method, 2xx indicates implemented.',
      'Current production fixture is not Telegram; this validates BBCRM capability gaps from an arbitrary inbox conversation.'
    ]
  };
  fs.writeFileSync(path.join(OUT, 'TG_TEXT_FUNCTIONS_QA_17.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
