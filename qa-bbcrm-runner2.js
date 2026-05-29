const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE='http://localhost:3017';
const OUT='/Users/muse/Developer/muse-crm/qa-output-17';
const shots=path.join(OUT,'screenshots'); fs.mkdirSync(shots,{recursive:true});
const results=[], issues=[], apiEvents=[], consoleErrors=[];
const log=(area,step,status,detail='')=>{results.push({area,step,status,detail}); console.log(`${status} [${area}] ${step} ${detail}`)};
const issue=(severity,area,title,detail)=>{issues.push({severity,area,title,detail}); console.log(`ISSUE ${severity} [${area}] ${title}: ${detail}`)};
const snap=async(page,name)=>{const p=path.join(shots,`${name}.png`); await page.screenshot({path:p,fullPage:true}).catch(()=>{}); return p};
const body=async(page)=>await page.locator('body').innerText({timeout:8000}).catch(e=>'');
async function login(page){await page.goto(`${BASE}/login`,{waitUntil:'domcontentloaded'}); await page.getByRole('textbox',{name:/Email/i}).fill('qa-admin@muse.local'); await page.getByRole('textbox',{name:/密碼|password/i}).fill('qa-admin-123'); await Promise.all([page.waitForURL(/\/inbox/,{timeout:10000}).catch(()=>null), page.getByRole('button',{name:'登入'}).click()]); log('Auth','login',page.url().includes('/inbox')?'PASS':'FAIL',page.url());}
async function pageCheck(page,url,must,area){await page.goto(`${BASE}${url}`,{waitUntil:'domcontentloaded',timeout:20000}); await page.waitForTimeout(1200); const t=await body(page); const missing=must.filter(m=>!t.includes(m)); log(area,'open/content',missing.length?'WARN':'PASS',missing.length?`missing ${missing.join(', ')}`:url); if(missing.length) issue('Medium',area,'Expected content missing',`${url}: ${missing.join(', ')}`); await snap(page,`page-${area.replace(/\W+/g,'-')}`); return t;}
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:950},locale:'zh-TW'});
 const page=await context.newPage();
 page.on('dialog', async d=>{log('Dialog',d.type(),'PASS',d.message()); await d.accept().catch(()=>{});});
 page.on('console', msg=>{if(['error','warning'].includes(msg.type())) consoleErrors.push({type:msg.type(),text:msg.text()})});
 page.on('pageerror', err=>consoleErrors.push({type:'pageerror',text:err.message||String(err)}));
 page.on('response', r=>{if(r.url().includes('/api/v1/')) apiEvents.push({method:r.request().method(),status:r.status(),url:r.url()})});
 await login(page); await snap(page,'01-login');
 await page.getByRole('button',{name:/王設計師/}).click({timeout:10000}); await page.waitForTimeout(900);
 let ta=page.getByRole('textbox',{name:/輸入訊息/});
 await ta.fill('QA 測試回覆：請提供尺寸，我們會提供正式報價。');
 const beforeCount=(await body(page)).split('QA 測試回覆').length-1;
 const sendResp=page.waitForResponse(r=>r.url().includes('/conversations/') && r.url().includes('/messages'),{timeout:12000}).catch(()=>null);
 await page.getByRole('button',{name:/發送/}).click({force:true});
 const sr=await sendResp; await page.waitForTimeout(1500); let t=await body(page);
 const afterCount=t.split('QA 測試回覆').length-1;
 log('Inbox Send','API success',sr&&sr.ok()?'PASS':'FAIL',sr?`${sr.status()} ${sr.url()}`:'no response');
 log('Inbox Send','UI append',afterCount>beforeCount?'PASS':'FAIL',`before=${beforeCount}, after=${afterCount}`);
 if(!(sr&&sr.ok())) issue('High','Inbox Send','Send API not successful','No successful /messages response captured');
 if(!(afterCount>beforeCount)) issue('High','Inbox Send','UI did not append sent message','Sent copy not visible after successful click');
 await snap(page,'02-send');
 // internal note
 await page.getByRole('button',{name:/內部備註/}).first().click({force:true}).catch(()=>{}); await page.waitForTimeout(400);
 ta=page.getByRole('textbox',{name:/輸入訊息/}); await ta.fill('QA 內部備註：這則不應發送給客戶。');
 const nrp=page.waitForResponse(r=>r.url().includes('/conversations/')&&r.url().includes('/messages'),{timeout:12000}).catch(()=>null);
 await page.getByRole('button',{name:/發送/}).click({force:true}).catch(()=>{});
 const nr=await nrp; await page.waitForTimeout(1200); t=await body(page);
 log('Internal Note','send/API',nr&&nr.ok()?'PASS':'WARN',nr?`${nr.status()}`:'no response');
 log('Internal Note','UI visible',t.includes('QA 內部備註')?'PASS':'WARN','internal note copy visibility'); await snap(page,'03-internal-note');
 // quick reply
 await page.getByRole('button',{name:/預存語錄/}).first().click({force:true}).catch(()=>{}); await page.waitForTimeout(700); t=await body(page);
 log('Quick Replies','open/list',/QA 報價開場|QA 預約看樣|預存語錄/.test(t)?'PASS':'WARN', 'quick reply panel');
 if(/QA 報價開場|QA 預約看樣/.test(t)){ await page.getByText(/QA 報價開場|QA 預約看樣/).first().click({force:true}).catch(()=>{}); await page.waitForTimeout(500); const val=await page.getByRole('textbox',{name:/輸入訊息/}).inputValue().catch(()=>null); log('Quick Replies','insert into composer',val&&val.length?'PASS':'WARN',val||'no composer value'); }
 await snap(page,'04-quick-reply');
 // escalation
 await page.getByRole('button',{name:/求援/}).first().click({force:true}).catch(()=>{}); await page.waitForTimeout(600); t=await body(page); log('Escalation','open',/請求主管支援|送出求援|求援/.test(t)?'PASS':'WARN','dialog/panel');
 await page.locator('textarea').last().fill('QA 求援測試：需要主管確認報價策略。').catch(()=>{});
 const erp=page.waitForResponse(r=>r.url().includes('/escalate'),{timeout:12000}).catch(()=>null);
 await page.getByRole('button',{name:/送出求援|確認|求援/}).last().click({force:true}).catch(()=>{}); const er=await erp; await page.waitForTimeout(1000); t=await body(page); log('Escalation','submit/API',er&&er.ok()?'PASS':'WARN',er?`${er.status()}`:'no response'); await snap(page,'05-escalation');
 // resolve: close copilot if intercepts
 await page.getByRole('button',{name:/關閉 Copilot/}).click({force:true}).catch(()=>{}); await page.waitForTimeout(300);
 const rrp=page.waitForResponse(r=>r.url().includes('/resolve')||r.url().includes('/conversations/'),{timeout:12000}).catch(()=>null);
 await page.getByRole('button',{name:/標記已解決/}).first().click({force:true}).catch(e=>issue('Medium','Resolve','Click failed',e.message));
 await page.getByRole('button',{name:/確認|解決/}).last().click({force:true}).catch(()=>{});
 const rr=await rrp; await page.waitForTimeout(1200); t=await body(page); log('Resolve','mark resolved',/已解決|重新開啟|已關閉/.test(t)?'PASS':'WARN',rr?`api ${rr.status()}`:'no api'); await snap(page,'06-resolve');
 // views filters search
 await page.goto(`${BASE}/inbox`,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(800);
 await page.getByRole('button',{name:/待認領/}).first().click({force:true}).catch(()=>{}); await page.waitForTimeout(800); t=await body(page); log('Inbox Views','待認領→林屋主',t.includes('林屋主')?'PASS':'WARN',t.slice(0,120).replace(/\n/g,' | '));
 await page.getByRole('button',{name:/團隊視圖/}).first().click({force:true}).catch(()=>{}); await page.waitForTimeout(800); t=await body(page); log('Inbox Views','團隊視圖/陳建材行',t.includes('陳建材行')?'PASS':'WARN','team view');
 await page.getByLabel(/篩選狀態/).selectOption({label:'已求援'}).catch(()=>{}); await page.waitForTimeout(600); t=await body(page); log('Inbox Filters','狀態已求援',t.includes('陳建材行')?'PASS':'WARN','status filter');
 await page.getByLabel(/篩選渠道/).selectOption({label:'Instagram'}).catch(()=>{}); await page.waitForTimeout(600); t=await body(page); log('Inbox Filters','渠道Instagram',t.includes('陳建材行')?'PASS':'WARN','channel filter');
 const s=page.getByRole('textbox',{name:/搜尋對話/}); if(await s.count()){await s.fill('陳'); await page.waitForTimeout(600); t=await body(page); log('Inbox Search','搜尋 陳',t.includes('陳建材行')?'PASS':'WARN','search');} await snap(page,'07-filters');
 // pages
 const pages=[['/contacts',['客戶','王設計師'],'Contacts'],['/quotes',['報價','QT-QA-0001'],'Quotes'],['/dashboard',['儀表板'],'Dashboard'],['/actions',['待辦','QA 待辦'],'Actions'],['/inventory',['庫存'],'Inventory'],['/knowledge-base',['知識庫'],'Knowledge Base'],['/settings',['設定'],'Settings']];
 for(const p of pages) await pageCheck(page,p[0],p[1],p[2]);
 await page.goto(`${BASE}/contacts`,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1000);
 for(const name of ['王設計師','林屋主']){ await page.getByText(name).first().click({force:true}).catch(()=>{}); await page.waitForTimeout(1000); t=await body(page); log('Contacts Detail',name,t.includes(name)?'PASS':'WARN',page.url()); await snap(page,`contact-${name}`); await page.goto(`${BASE}/contacts`,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(700); }
 const badApi=apiEvents.filter(e=>e.status>=400); if(badApi.length) issue('High','API','4xx/5xx responses observed',JSON.stringify(badApi.slice(0,30),null,2));
 if(consoleErrors.length) issue('Medium','Console','Console/page errors observed',JSON.stringify(consoleErrors.slice(0,30),null,2));
 fs.writeFileSync(path.join(OUT,'qa-results.json'),JSON.stringify({results,issues,apiEvents,consoleErrors},null,2));
 await browser.close(); console.log('QA_JSON',path.join(OUT,'qa-results.json'));
})();
