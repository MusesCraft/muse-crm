import { io } from '../frontend/node_modules/socket.io-client/build/esm/index.js';
import fs from 'node:fs/promises';

const FRONT = process.env.QA_FRONT || 'https://frontend-production-0866.up.railway.app';
const API = process.env.QA_API || 'https://backend-production-5171.up.railway.app/api/v1';
const SOCKET_BASE = API.replace(/\/api\/v[0-9]+\/?$/, '');
const EMAIL = process.env.QA_EMAIL || 'admin@muse-crm.com';
const PASSWORD = process.env.QA_PASSWORD || '';
const OUT = process.env.QA_OUT || '../qa-output-17/realtime-qa-live-results.json';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const result = { env: { FRONT, API, SOCKET_BASE, EMAIL }, started_at: nowIso(), steps: [], events: [], findings: [] };
function step(name, status, details = {}) { result.steps.push({ name, status, at: nowIso(), ...details }); console.log(`[${status}] ${name}`, details); }
function finding(severity, title, evidence, recommendation) { result.findings.push({ severity, title, evidence, recommendation }); }
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} HTTP ${res.status}: ${text.slice(0, 500)}`);
  return data;
}

try {
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const token = login.token || login.access_token || login.data?.token;
  if (!token) throw new Error('login succeeded but token missing');
  step('API login', 'PASS', { token_prefix: token.slice(0, 12) });

  const convs = await api('/inbox/conversations?page=1&per_page=20&view=team', { headers: { Authorization: `Bearer ${token}` } });
  const list = convs.data || [];
  const conv = list.find(c => c.status !== 'closed') || list[0];
  if (!conv) throw new Error('no conversations available for realtime test');
  step('Fetch target conversation', 'PASS', { conversation_id: conv.id, status: conv.status, channel: conv.channel, contact_id: conv.contact_id || conv.contact?.id, last_message: conv.last_message?.id });

  const socket = io(`${SOCKET_BASE}/notifications`, {
    transports: ['websocket', 'polling'],
    auth: { token },
    query: { auth: token },
    reconnection: false,
    timeout: 10000,
  });
  socket.onAny((event, data) => { result.events.push({ event, at: nowIso(), data }); console.log('[event]', event, JSON.stringify(data).slice(0, 300)); });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('socket connect timeout')), 12000);
    socket.on('connect', () => { clearTimeout(t); resolve(); });
    socket.on('connect_error', (err) => { clearTimeout(t); reject(err); });
  });
  step('Socket.io connect /notifications', 'PASS', { socket_id: socket.id });
  await sleep(800);

  const marker = `QA17 realtime internal note ${Date.now()}`;
  const beforeEvents = result.events.length;
  const send = await api(`/inbox/conversations/${conv.id}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content: marker, message_type: 'text', is_internal: true }),
  });
  const messageId = send.data?.id || send.message_id;
  step('Create internal message via send endpoint', 'PASS', { message_id: messageId, response_message: send.message, marker });
  await sleep(3500);
  const sendEvents = result.events.slice(beforeEvents).map(e => e.event);
  if (sendEvents.includes('new_message')) {
    step('Realtime event after send endpoint', 'PASS', { events: sendEvents });
  } else {
    step('Realtime event after send endpoint', 'FAIL', { events: sendEvents, expected: 'new_message' });
    finding('P0', 'Outbound/internal messages are persisted without emitting new_message', {
      endpoint: `POST /inbox/conversations/${conv.id}/send`, message_id: messageId, observed_events: sendEvents,
      code: 'backend/app/api/inbox.py:405 returns after db.session.commit() without emit_new_message/_emit_message_action',
    }, 'After committing send_message/send_image_message, call emit_new_message(message=msg, conversation=conversation, contact=contact) or a scoped message.created event subscribed by Inbox list/detail.');
  }

  if (messageId) {
    const beforePin = result.events.length;
    const pin = await api(`/inbox/messages/${messageId}/pin`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({}) });
    step('Pin created message', 'PASS', { message_id: messageId, response_message: pin.message });
    await sleep(2500);
    const pinEvents = result.events.slice(beforePin).map(e => e.event);
    if (pinEvents.includes('message.pinned')) step('Realtime event after pin', 'PASS', { events: pinEvents });
    else {
      step('Realtime event after pin', 'FAIL', { events: pinEvents, expected: 'message.pinned' });
      finding('P1', 'Message action event did not arrive at current admin socket', { message_id: messageId, observed_events: pinEvents }, 'Verify emit_scoped room targeting and frontend socket auth/rooms.');
    }
  }

  const detail = await api(`/inbox/conversations/${conv.id}`, { headers: { Authorization: `Bearer ${token}` } });
  const persisted = (detail.messages || []).some(m => m.id === messageId || m.content === marker);
  step('Verify DB/API persistence of test message', persisted ? 'PASS' : 'FAIL', { message_id: messageId, persisted });

  socket.disconnect();
  result.finished_at = nowIso();
  await fs.writeFile(new URL(OUT, import.meta.url), JSON.stringify(result, null, 2));
  console.log(`Wrote ${OUT}`);
} catch (err) {
  result.error = err.stack || String(err);
  result.finished_at = nowIso();
  await fs.writeFile(new URL(OUT, import.meta.url), JSON.stringify(result, null, 2));
  console.error(err);
  process.exitCode = 1;
}
