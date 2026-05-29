const { chromium } = require('playwright');
(async()=>{
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:1440,height:950}, locale:'zh-TW'});
 page.on('dialog', async d => { console.log('DIALOG', d.message()); await d.accept(); });
 page.on('response', r => { if(r.url().includes('/send')) console.log('SEND_RESPONSE', r.status(), r.url()); });
 await page.goto('http://localhost:3017/login', {waitUntil:'domcontentloaded'});
 if(!page.url().includes('/inbox')){
   await page.getByRole('textbox',{name:/Email/i}).fill('qa-admin@muse.local');
   await page.getByRole('textbox',{name:/密碼|password/i}).fill('qa-admin-123');
   await Promise.all([page.waitForURL(/inbox/, {timeout:10000}).catch(()=>null), page.getByRole('button',{name:'登入'}).click()]);
 }
 if(!page.url().includes('/inbox')) await page.goto('http://localhost:3017/inbox', {waitUntil:'domcontentloaded'});
 await page.waitForTimeout(1000);
 await page.getByRole('button',{name:/王設計師/}).click();
 await page.waitForTimeout(800);
 const toggle = page.getByRole('button',{name:/切到內部備註/}).first();
 console.log('toggle count', await toggle.count());
 await toggle.click({force:true});
 await page.waitForTimeout(500);
 console.log('mode visible', (await page.locator('body').innerText()).includes('內部備註模式'));
 const msg = `QA 內部備註 focused ${Date.now()}`;
 await page.getByRole('textbox',{name:/輸入訊息/}).fill(msg);
 await page.getByRole('button',{name:/發送/}).click({force:true});
 await page.waitForTimeout(1500);
 console.log('msg', msg);
 console.log('visible', (await page.locator('body').innerText()).includes(msg));
 await page.screenshot({path:'/Users/muse/Developer/muse-crm/qa-output-17/screenshots/internal-focused.png', fullPage:true});
 await browser.close();
})();
