const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3017';
const OUT = '/Users/muse/Developer/muse-crm/qa-output-17';
const shots = path.join(OUT, 'screenshots');
fs.mkdirSync(shots, { recursive: true });

const results = [];
const issues = [];
const apiEvents = [];
const consoleErrors = [];
function log(area, step, status, detail='') { results.push({area, step, status, detail}); console.log(`${status} [${area}] ${step} ${detail}`); }
function issue(severity, area, title, detail) { issues.push({severity, area, title, detail}); console.log(`ISSUE ${severity} [${area}] ${title}: ${detail}`); }
async function snap(page, name) { const p = path.join(shots, `${name}.png`); await page.screenshot({ path:p, fullPage:true }); return p; }
async function text(page) { return (await page.locator('body').innerText({timeout:5000}).catch(e=>'')); }
async function clickText(page, re, area, step, timeout=5000) {
  const loc = page.getByRole('button', { name: re }).first();
  if (await loc.count().catch(()=>0)) { await loc.click({timeout}); log(area, step, 'PASS', `clicked ${re}`); return true; }
  log(area, step, 'WARN', `button not found ${re}`); return false;
}
async function gotoCheck(page, url, must, area) {
  await page.goto(`${BASE}${url}`, { waitUntil:'domcontentloaded', timeout:20000 });
  await page.waitForTimeout(1200);
  const body = await text(page);
  const missing = must.filter(m=>!body.includes(m));
  if (missing.length) { issue('Medium', area, 'Expected copy missing', `URL ${url}, missing: ${missing.join(', ')}`); log(area, 'page content', 'WARN', body.slice(0,200).replace(/\n/g,' | ')); }
  else log(area, 'page content', 'PASS', url);
  await snap(page, area.replace(/\W+/g,'-').toLowerCase());
  return body;
}

(async()=>{
 const browser = await chromium.launch({ headless:true });
 const context = await browser.newContext({ viewport:{width:1440,height:950}, locale:'zh-TW' });
 const page = await context.newPage();
 page.on('console', msg => { if (['error','warning'].includes(msg.type())) consoleErrors.push({type:msg.type(), text:msg.text()}); });
 page.on('pageerror', err => consoleErrors.push({type:'pageerror', text:err.message || String(err)}));
 page.on('response', resp => { const u=resp.url(); if (u.includes('/api/v1/')) apiEvents.push({url:u, status:resp.status(), method:resp.request().method()}); });

 // Login
 await page.goto(`${BASE}/login`, { waitUntil:'domcontentloaded' });
 await page.getByRole('textbox', { name:/Email/i }).fill('qa-admin@muse.local');
 await page.getByRole('textbox', { name:/密碼|password/i }).fill('qa-admin-123');
 await Promise.all([
   page.waitForURL(/\/inbox/, {timeout:10000}).catch(()=>null),
   page.getByRole('button', {name:'登入'}).click()
 ]);
 if (page.url().includes('/inbox')) log('Auth','login','PASS',page.url()); else { issue('Critical','Auth','Local login failed',page.url()); }
 await snap(page,'01-login-inbox');

 // Select 王設計師 and send message
 await page.getByRole('button', { name:/王設計師/ }).click({timeout:10000});
 await page.waitForTimeout(800);
 let input = page.getByRole('textbox', { name:/輸入訊息/ });
 await input.fill('QA 測試回覆：請提供尺寸，我們會提供正式報價。');
 const sendRespPromise = page.waitForResponse(r => r.url().includes('/messages') || r.url().includes('/send'), {timeout:10000}).catch(e=>null);
 await page.getByRole('button', { name:/發送/ }).click({timeout:5000});
 const sendResp = await sendRespPromise;
 await page.waitForTimeout(1200);
 let body = await text(page);
 const appended = body.includes('QA 測試回覆：請提供尺寸');
 log('Inbox Send','UI append', appended?'PASS':'FAIL', appended?'message visible':'message not found after send');
 if (!appended) issue('High','Inbox Send','Sent message not appended to UI','After clicking 發送, sent text not visible');
 log('Inbox Send','API response', sendResp && sendResp.ok()?'PASS':'WARN', sendResp ? `${sendResp.status()} ${sendResp.url()}` : 'no matching response captured');
 await snap(page,'02-send-message');

 // Internal note mode
 const noteBtn = page.getByRole('button', { name:/內部備註/ }).first();
 if (await noteBtn.count()) {
   await noteBtn.click(); await page.waitForTimeout(400);
   input = page.getByRole('textbox', { name:/輸入訊息/ });
   await input.fill('QA 內部備註：這則不應發送給客戶。');
   const noteRespPromise = page.waitForResponse(r => r.url().includes('/messages') || r.url().includes('/internal'), {timeout:10000}).catch(e=>null);
   const send = page.getByRole('button', { name:/發送|新增/ }).last();
   await send.click().catch(()=>{});
   const noteResp = await noteRespPromise;
   await page.waitForTimeout(1000);
   body = await text(page);
   log('Internal Note','toggle/send', body.includes('QA 內部備註')?'PASS':'WARN', noteResp ? `api ${noteResp.status()}` : 'no api captured');
 } else issue('Medium','Internal Note','Internal note toggle unavailable','No 內部備註 button found');
 await snap(page,'03-internal-note');

 // Quick replies
 const qrBtn = page.getByRole('button', { name:/預存語錄/ }).first();
 if (await qrBtn.count()) {
   await qrBtn.click(); await page.waitForTimeout(800);
   body = await text(page);
   const hasQR = body.includes('QA 報價開場') || body.includes('QA 預約看樣') || body.includes('您好，我們可以先確認');
   log('Quick Replies','open/list', hasQR?'PASS':'WARN', hasQR?'fixture quick replies visible':'fixture quick replies not visible');
   if (hasQR) {
     await page.getByText(/QA 報價開場|您好，我們可以先確認/).first().click().catch(()=>{});
     await page.waitForTimeout(600);
     body = await text(page);
     log('Quick Replies','select/insert', body.includes('您好，我們可以先確認')?'PASS':'WARN','checked inserted/visible copy');
   }
 } else issue('Medium','Quick Replies','預存語錄 button unavailable','No quick reply control found');
 await snap(page,'04-quick-replies');

 // Escalate
 const escBtn = page.getByRole('button', { name:/求援/ }).first();
 if (await escBtn.count()) {
   await escBtn.click(); await page.waitForTimeout(700);
   body = await text(page);
   log('Escalation','open', /求援|原因|升級|已求援/.test(body)?'PASS':'WARN', body.slice(-200).replace(/\n/g,' | '));
   const reason = page.locator('textarea, input').filter({ hasText: /./ }).last();
   await page.keyboard.type('QA 求援測試：需要主管確認報價策略。').catch(()=>{});
   await page.getByRole('button', { name:/確認|送出|求援/ }).last().click().catch(()=>{});
   await page.waitForTimeout(1200);
   body = await text(page);
   log('Escalation','submit', /已求援|求援|escalated|主管/.test(body)?'PASS':'WARN','checked state text');
 } else issue('Medium','Escalation','求援 button unavailable','No escalate control found');
 await snap(page,'05-escalation');

 // Resolve
 const resBtn = page.getByRole('button', { name:/標記已解決/ }).first();
 if (await resBtn.count()) {
   const resPromise = page.waitForResponse(r=>r.url().includes('/resolve') || r.url().includes('/conversations'), {timeout:10000}).catch(()=>null);
   await resBtn.click();
   await page.getByRole('button', {name:/確認|解決/}).last().click().catch(()=>{});
   const resp = await resPromise; await page.waitForTimeout(1200);
   body = await text(page);
   log('Resolve','mark resolved', /已解決|重新開啟|reopen/.test(body)?'PASS':'WARN', resp?`api ${resp.status()}`:'no api captured');
 } else issue('Medium','Resolve','標記已解決 unavailable','No resolve control found');
 await snap(page,'06-resolve');

 // Views / filters / search
 await page.getByRole('button', { name:/待認領/ }).first().click().catch(()=>{}); await page.waitForTimeout(800); body = await text(page);
 log('Inbox Views','待認領→林屋主', body.includes('林屋主')?'PASS':'WARN', body.slice(0,200).replace(/\n/g,' | '));
 await page.getByRole('button', { name:/團隊視圖/ }).first().click().catch(()=>{}); await page.waitForTimeout(800); body = await text(page);
 log('Inbox Views','團隊視圖', (body.includes('陳建材行')||body.includes('林屋主')||body.includes('王設計師'))?'PASS':'WARN','team view checked');
 // status/channel via native selects
 await page.locator('select[aria-label="篩選狀態"]').selectOption({label:'已求援'}).catch(async()=>{ await page.getByLabel(/篩選狀態/).selectOption({label:'已求援'}).catch(()=>{}); });
 await page.waitForTimeout(700); body = await text(page);
 log('Inbox Filters','status 已求援→陳建材行', body.includes('陳建材行')?'PASS':'WARN', 'status filter checked');
 await page.locator('select[aria-label="篩選渠道"]').selectOption({label:'Instagram'}).catch(async()=>{ await page.getByLabel(/篩選渠道/).selectOption({label:'Instagram'}).catch(()=>{}); });
 await page.waitForTimeout(700); body = await text(page);
 log('Inbox Filters','channel Instagram', body.includes('陳建材行')?'PASS':'WARN', 'channel filter checked');
 const search = page.getByRole('textbox', {name:/搜尋對話/});
 if (await search.count()) { await search.fill('陳'); await page.waitForTimeout(700); body=await text(page); log('Inbox Search','search 陳', body.includes('陳建材行')?'PASS':'WARN','search checked'); }
 await snap(page,'07-views-filters-search');

 // Main pages
 const pages = [
   ['/contacts',['客戶','王設計師'],'Contacts'],
   ['/quotes',['報價','QT-QA-0001'],'Quotes'],
   ['/dashboard',['儀表板'],'Dashboard'],
   ['/actions',['待辦','QA 待辦'],'Actions'],
   ['/inventory',['庫存'],'Inventory'],
   ['/knowledge-base',['知識庫'],'Knowledge Base'],
   ['/settings',['設定'],'Settings']
 ];
 for (const [url,must,area] of pages) await gotoCheck(page,url,must,area);
 // Contacts detail 2/3
 await page.goto(`${BASE}/contacts`, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1000);
 for (const name of ['王設計師','林屋主']) { await page.getByText(name).first().click().catch(()=>{}); await page.waitForTimeout(1000); const b=await text(page); log('Contacts Detail', name, b.includes(name)?'PASS':'WARN', page.url()); await snap(page,`contact-${name}`); await page.goto(`${BASE}/contacts`, {waitUntil:'domcontentloaded'}); await page.waitForTimeout(700); }

 // Summaries
 const badApi = apiEvents.filter(e=>e.status>=400);
 if (badApi.length) issue('High','API','4xx/5xx API responses during QA', JSON.stringify(badApi.slice(0,20), null, 2));
 if (consoleErrors.length) issue('Medium','Console','Console/page errors observed', JSON.stringify(consoleErrors.slice(0,20), null, 2));
 fs.writeFileSync(path.join(OUT,'qa-results.json'), JSON.stringify({results,issues,apiEvents,consoleErrors}, null, 2));
 await browser.close();
 console.log('QA_JSON', path.join(OUT,'qa-results.json'));
})();
