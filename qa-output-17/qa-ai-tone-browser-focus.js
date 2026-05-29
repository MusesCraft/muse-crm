const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const FRONT='https://frontend-production-0866.up.railway.app';
const API='https://backend-production-5171.up.railway.app/api/v1';
const EMAIL=process.env.QA_EMAIL || 'admin@muse-crm.com';
const PASSWORD=process.env.QA_PASSWORD || '';
const OUT='/Users/muse/Developer/muse-crm/qa-output-17';
const SHOTS=path.join(OUT,'screenshots-ai-tone'); fs.mkdirSync(SHOTS,{recursive:true});
const results=[], issues=[], apiEvents=[], consoleEvents=[], artifacts=[];
const log=(area,step,status,detail='')=>{results.push({area,step,status,detail}); console.log(`${status} [${area}] ${step} ${detail}`)};
const issue=(severity,area,title,detail,artifact=null)=>{issues.push({severity,area,title,detail,artifact}); console.log(`ISSUE ${severity} [${area}] ${title}: ${detail}`)};
const shot=async(page,name)=>{const p=path.join(SHOTS,`${name}.png`); await page.screenshot({path:p,fullPage:true}).catch(()=>{}); artifacts.push(p); return p};
async function api(pathname, opts={}, token=null){const res=await fetch(`${API}${pathname}`,{...opts,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}}); const text=await res.text(); let body; try{body=text?JSON.parse(text):null}catch{body=text}; return {ok:res.ok,status:res.status,body};}
(async()=>{
 const login=await api('/auth/login',{method:'POST',body:JSON.stringify({email:EMAIL,password:PASSWORD})}); if(!login.ok) throw new Error(`login ${login.status}`); const token=login.body.token, refreshToken=login.body.refresh_token;
 const convs=await api('/inbox/conversations?per_page=20&view=team',{},token); const conv=(convs.body.data||[]).find(c=>(c.message_count||0)>0);
 log('Setup','conversation selected',conv?'PASS':'FAIL',conv?`${conv.contact?.display_name||conv.contact?.name} ${conv.id}`:'none'); if(!conv) process.exit(1);
 let latest=null; for(let i=0;i<12;i++){ await new Promise(r=>setTimeout(r,5000)); const d=await api(`/inbox/conversations/${conv.id}`,{},token); const count=d.body?.analyses?.length||0; log('API Poll','analysis count',count?'PASS':'WARN',`attempt=${i+1}; count=${count}`); if(count){latest=d.body.analyses[0]; break;} }
 if(!latest) issue('High','API Analyze','No persisted analysis after extended 60s poll',`conversation=${conv.id}`); else log('API Analyze','latest fields',['positive','neutral','negative'].includes(latest.sentiment)?'PASS':'WARN',`sentiment=${latest.sentiment}; urgency=${latest.urgency}; model=${latest.model_used}`);
 const browser=await chromium.launch({headless:true}); const context=await browser.newContext({viewport:{width:1440,height:950},locale:'zh-TW'});
 await context.addInitScript(({token,refreshToken})=>{localStorage.setItem('muse_token',token); localStorage.setItem('muse_refresh_token',refreshToken);}, {token,refreshToken});
 const page=await context.newPage(); page.on('console',msg=>{if(['error','warning'].includes(msg.type())) consoleEvents.push({type:msg.type(),text:msg.text()})}); page.on('pageerror',err=>consoleEvents.push({type:'pageerror',text:err.message||String(err)})); page.on('response',r=>{if(r.url().includes('/api/v1/')) apiEvents.push({method:r.request().method(),status:r.status(),url:r.url()})});
 await page.goto(`${FRONT}/inbox`,{waitUntil:'domcontentloaded',timeout:30000}); await page.waitForTimeout(1600);
 await page.getByRole('button',{name:/團隊視圖/}).click({force:true,timeout:8000}).catch(e=>issue('Medium','Browser Inbox','Cannot click team view',e.message)); await page.waitForTimeout(1800);
 let text=await page.locator('body').innerText().catch(()=>''); await shot(page,'04-team-view'); log('Browser Inbox','team view contains contact',text.includes(conv.contact?.display_name||conv.contact?.name)?'PASS':'WARN',(conv.contact?.display_name||conv.contact?.name));
 await page.getByText(conv.contact?.display_name||conv.contact?.name,{exact:false}).first().click({force:true,timeout:8000}).catch(e=>issue('Medium','Browser Inbox','Cannot select target conversation',e.message)); await page.waitForTimeout(2500);
 text=await page.locator('body').innerText().catch(()=>''); const detailShot=await shot(page,'05-selected-conversation-ai-panel'); log('Browser Detail','AI panel visible',/AI 分析|客戶意圖|深度分析|需求摘要/.test(text)?'PASS':'WARN',text.slice(0,250).replace(/\n/g,' | '));
 const analyzeButton=page.getByRole('button',{name:/深度分析/}).first(); const hasBtn=await analyzeButton.count().then(c=>c>0).catch(()=>false);
 log('Browser AI','deep analyze button visible',hasBtn?'PASS':'WARN','button=深度分析');
 if(hasBtn){ const beforeText=text; const respP=page.waitForResponse(r=>r.url().includes('/analyze'),{timeout:15000}).catch(()=>null); await analyzeButton.click({force:true}); const resp=await respP; await page.waitForTimeout(3500); text=await page.locator('body').innerText().catch(()=>''); const p=await shot(page,'06-after-click-deep-analysis'); log('Browser AI','POST /analyze captured',resp&&resp.status()===202?'PASS':'WARN',resp?`${resp.status()} ${resp.url()}`:'none'); log('Browser AI','analysis display changed',text!==beforeText&&/正面|中性|負面|需求摘要|建議動作/.test(text)?'PASS':'WARN','after click panel text'); if(text.includes('客戶正在詢問產品規格與報價，有明確購買意向')&&text.includes('Laminam')) issue('High','Browser AI','Deep analysis displays hard-coded mock result','After successful POST, UI shows fixed mock demand/products/sentiment rather than polling backend result.',p); }
 const bad=apiEvents.filter(e=>e.status>=400&&!e.url.includes('/auth/refresh')); if(bad.length) issue('High','Browser API','4xx/5xx responses',JSON.stringify(bad.slice(0,20),null,2)); if(consoleEvents.length) issue('Medium','Browser Console','Console/page errors',JSON.stringify(consoleEvents.slice(0,20),null,2));
 const report={timestamp:new Date().toISOString(),scope:{FRONT,API,conversation_id:conv.id,contact:conv.contact?.display_name||conv.contact?.name},latest_analysis:latest,results,issues,apiEvents,consoleEvents,artifacts}; const out=path.join(OUT,'ai-tone-analysis-browser-focus-results.json'); fs.writeFileSync(out,JSON.stringify(report,null,2)); await browser.close(); console.log(`QA_RESULTS=${out}`);
})();
