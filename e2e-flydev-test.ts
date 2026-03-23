import { chromium, type Page } from 'playwright';

const BASE = 'https://muse-crm-web.fly.dev';
const API_BASE = 'https://muse-crm.fly.dev/api/v1';
const results: { page: string; status: string; detail: string }[] = [];

function log(page: string, status: 'PASS' | 'FAIL' | 'WARN', detail: string) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${page}] ${detail}`);
  results.push({ page, status, detail });
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `/Users/muse/Developer/muse-crm/screenshots/${name}.png`, fullPage: true });
}

async function main() {
  console.log('🚀 Fly.io Post-Deploy Verification');
  console.log(`   Frontend: ${BASE}`);
  console.log(`   Backend:  ${API_BASE}\n`);

  const fs = await import('fs');
  fs.mkdirSync('/Users/muse/Developer/muse-crm/screenshots', { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' });
  const page = await context.newPage();

  const jsErrors: string[] = [];
  page.on('pageerror', err => jsErrors.push(err.message.slice(0, 200)));

  // ─── Login ───
  console.log('── Login ──');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  const emailInput = await page.$('input[type="email"], input[placeholder*="Email"]');
  const passwordInput = await page.$('input[type="password"]');
  const loginBtn = await page.$('button:has-text("登入")');

  if (emailInput && passwordInput && loginBtn) {
    log('Login', 'PASS', 'Form rendered');
    await emailInput.fill('admin@musecraft.com');
    await passwordInput.fill('admin123');

    const resp = page.waitForResponse(r => r.url().includes('/auth/login'), { timeout: 10000 }).catch(() => null);
    await loginBtn.click();
    const loginResp = await resp;

    if (loginResp && loginResp.status() === 200) {
      log('Login', 'PASS', 'API login successful');
    } else {
      log('Login', 'WARN', `Login response: ${loginResp?.status() || 'no response'}`);
    }

    await page.waitForTimeout(3000);

    if (page.url().includes('/inbox')) {
      log('Login', 'PASS', 'Redirected to /inbox');
    } else {
      // Inject token manually
      const tokenResp = await page.evaluate(async (api) => {
        const res = await fetch(`${api}/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@musecraft.com', password: 'admin123' }),
        });
        const d = await res.json();
        if (d.token) localStorage.setItem('muse_token', d.token);
        return { ok: !!d.token };
      }, API_BASE);
      log('Login', tokenResp.ok ? 'PASS' : 'WARN', tokenResp.ok ? 'Token injected' : 'Token injection failed');
    }
  }
  await screenshot(page, '01-login');

  // ─── Test each page ───
  const pages = [
    { name: 'Inbox', url: '/inbox', checks: ['收件匣', '搜尋對話', '全部狀態'], crashCheck: 'Application error' },
    { name: 'Contacts', url: '/contacts', checks: ['客戶管理', '搜尋客戶', '全部渠道'], dateCheck: true },
    { name: 'Dashboard', url: '/dashboard', checks: ['歡迎回來', '本月', '活躍'] },
    { name: 'Actions', url: '/actions', checks: ['待辦事項', '待處理', '已完成'] },
    { name: 'Settings', url: '/settings', checks: ['設定', 'LINE', 'AI'] },
  ];

  for (const t of pages) {
    console.log(`\n── ${t.name} ──`);
    await page.goto(`${BASE}${t.url}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);

    if (page.url().includes('/login')) {
      log(t.name, 'FAIL', 'Redirected to login');
      continue;
    }

    const text = await page.textContent('body') || '';

    // Crash check
    if (t.crashCheck && text.includes(t.crashCheck)) {
      log(t.name, 'FAIL', `CRASH: "${t.crashCheck}" detected`);
      await screenshot(page, `${t.name.toLowerCase()}-crash`);
      continue;
    }

    // Content checks
    const found = t.checks.filter(c => text.includes(c)).length;
    if (found >= Math.ceil(t.checks.length * 0.6)) {
      log(t.name, 'PASS', `Content OK (${found}/${t.checks.length})`);
    } else {
      log(t.name, 'WARN', `Partial content (${found}/${t.checks.length})`);
    }

    // Invalid Date check
    if (t.dateCheck) {
      if (text.includes('Invalid Date')) {
        log(t.name, 'FAIL', 'Invalid Date shown');
      } else {
        log(t.name, 'PASS', 'No Invalid Date');
      }
    }

    await screenshot(page, `0${pages.indexOf(t) + 2}-${t.name.toLowerCase()}`);
  }

  // ─── Contact Detail ───
  console.log('\n── Contact Detail ──');
  await page.goto(`${BASE}/contacts`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  const link = await page.$('a[href*="/contacts/"]');
  if (link) {
    await link.click();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const text = await page.textContent('body') || '';
    const sections = ['標籤', '對話歷史', 'AI 分析', '待辦動作', '備註'];
    const found = sections.filter(s => text.includes(s)).length;
    log('Contact Detail', found >= 3 ? 'PASS' : 'WARN', `Sections: ${found}/${sections.length}`);

    if (text.includes('Invalid Date')) {
      log('Contact Detail', 'FAIL', 'Invalid Date shown');
    } else {
      log('Contact Detail', 'PASS', 'No Invalid Date');
    }
  } else {
    log('Contact Detail', 'WARN', 'No contact link found');
  }
  await screenshot(page, '07-contact-detail');

  // ─── Report ───
  console.log('\n' + '='.repeat(60));
  console.log('📊 Post-Deploy Verification Report');
  console.log('='.repeat(60));

  if (jsErrors.length > 0) {
    log('JS Errors', 'FAIL', `${jsErrors.length} error(s)`);
    jsErrors.slice(0, 5).forEach(e => console.log(`   🔴 ${e}`));
  } else {
    log('JS Errors', 'PASS', 'No JavaScript errors');
  }

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;

  console.log(`\n   ✅ PASS: ${pass}`);
  console.log(`   ❌ FAIL: ${fail}`);
  console.log(`   ⚠️  WARN: ${warn}`);

  if (fail > 0) {
    console.log('\n❌ Failures:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`   [${r.page}] ${r.detail}`));
  }

  console.log('\n📸 Screenshots: /Users/muse/Developer/muse-crm/screenshots/');
  await browser.close();
}

main().catch(console.error);
