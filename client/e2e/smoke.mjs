// End-to-end checks for the new UI, against the mock build.
// Run:  npm run build:mock && npx vite preview --port 4173 --mode mock &  then  node e2e/smoke.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
const errors = [];
async function newPage(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 900 });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
}
const me = (p) => p.evaluate(() => fetch('/api/me').then((r) => r.json()));
const login = async (p, name, url) => { await p.goto(BASE + '/login'); await p.getByRole('button', { name }).click(); await p.waitForURL(url); };
const axe = async (p, label, selector = null) => {
  await p.addScriptTag({ content: axeSource });
  const r = await p.evaluate((selector) => window.axe.run(selector ?? document, { runOnly: ['wcag2a', 'wcag2aa'] }), selector);
  const v = r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical');
  assert(v.length === 0, `${label}: ${v.map((x) => `${x.id}(${x.nodes.length})`).join(', ')}`);
};

/* ---------- public ---------- */
{
  const p = await newPage();
  await check('landing: headline, primary CTA, benefits dots, no horizontal scroll', async () => {
    await p.goto(BASE + '/');
    await p.getByRole('heading', { name: '找到屬於你的聲音' }).waitFor();
    assert(await p.getByRole('link', { name: '免費諮詢' }).first().isVisible(), 'CTA missing');
    assert((await p.locator('.dots button').count()) === 3, 'dots');
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow');
  });
  await check('landing: axe', async () => axe(p, 'landing'));
  await check('consult: validation, submit, thank-you repeats channel + time', async () => {
    await p.goto(BASE + '/consult');
    await p.getByRole('button', { name: '和 Iris 聊聊' }).click();
    await p.getByText('請填寫名字。').waitFor();
    await p.getByLabel('名字').fill('測試');
    await p.getByLabel('LINE ID').fill('test_line');
    await p.getByRole('radio', { name: '週末' }).click();
    await p.getByRole('button', { name: '和 Iris 聊聊' }).click();
    await p.getByRole('heading', { name: /收到你的訊息了/ }).waitFor();
    const t = await p.locator('.card').innerText();
    assert(t.includes('週末') && t.includes('LINE'), 'thank-you content');
  });
  await check('login: wrong password shows one generic error', async () => {
    await p.goto(BASE + '/login');
    await p.getByRole('button', { name: '使用 Email 登入' }).click();
    await p.getByLabel('Email').fill('xiaoming@demo.local');
    await p.getByLabel('密碼', { exact: true }).fill('wrongpass1');
    await p.getByRole('button', { name: '登入', exact: true }).click();
    await p.getByRole('alert').getByText('Email 或密碼不正確。').waitFor();
  });
  await check('login: unauthenticated /app goes to /login', async () => {
    const q = await newPage(); await q.goto(BASE + '/app'); await q.waitForURL('**/login'); await q.context().close();
  });
  await p.context().close();
}

/* ---------- student ---------- */
{
  const p = await newPage();
  await login(p, '學生：王小明', '**/app');
  await check('student home: proposal card on top, quota', async () => {
    await p.getByText('老師想調整上課時間').waitFor();
    await p.getByText(/剩餘 \d+ 堂/).first().waitFor();
    assert(await p.getByRole('button', { name: '不方便' }).isVisible(), 'decline button');
  });
  await check('student: accept proposal removes the card', async () => {
    await p.getByRole('button', { name: '可以，改到這個時間' }).click();
    await p.getByText('老師想調整上課時間').waitFor({ state: 'detached' });
  });
  await check('student home: axe', async () => axe(p, 'student home'));
  await check('book: pick slot, confirm sheet, success, credit used', async () => {
    const before = (await me(p)).credits;
    await p.goto(BASE + '/app/book');
    assert(await p.getByRole('button', { name: '請選擇時段' }).isDisabled(), 'CTA must be disabled before a pick');
    await p.locator('.time:not([disabled])').first().click();
    await p.getByRole('button', { name: /^確認預約 / }).click();
    const d = p.getByRole('dialog'); await d.waitFor();
    await d.getByRole('button', { name: '確認預約' }).click();
    await p.getByText('預約完成').waitFor();
    assert((await me(p)).credits === before - 1, 'credit not deducted');
  });
  await check('back gesture closes a sheet instead of leaving the page', async () => {
    await p.goto(BASE + '/app/book');
    await p.locator('.time:not([disabled])').first().click();
    await p.getByRole('button', { name: /^確認預約 / }).click();
    await p.getByRole('dialog').waitFor();
    await p.goBack();
    await p.getByRole('dialog').waitFor({ state: 'detached' });
    assert(p.url().includes('/app/book') && !p.url().includes('confirm'), p.url());
  });
  await check('cancel: sheet states refund rule, cancels, offers 復原', async () => {
    await p.goto(BASE + '/app');
    await p.getByRole('link', { name: '取消預約' }).first().click();
    const d = p.getByRole('dialog'); await d.waitFor();
    assert(/退回|不會退回/.test(await d.innerText()), 'refund policy missing');
    await d.getByRole('button', { name: '取消這堂課' }).click();
    await p.getByRole('status').getByRole('button', { name: '復原' }).waitFor();
  });
  await check('quota page: bank details, receipt type validation', async () => {
    await p.goto(BASE + '/app/quota');
    await p.getByText('匯款資料').waitFor();
    await p.getByRole('radio', { name: /方案 · 4 堂/ }).waitFor();
    assert(await p.getByRole('radio', { name: /單堂課/ }).count() === 0, 'single lesson must be hidden before consultation');
    await p.setInputFiles('#rc', { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
    await p.getByText('請選擇 JPG、PNG 或 WEBP 圖片。').waitFor();
  });
  await check('calendar, alerts, profile: axe is clean', async () => {
    for (const path of ['/app/calendar', '/app/alerts', '/app/profile']) { await p.goto(BASE + path); await p.waitForTimeout(400); await axe(p, path); }
  });
  await p.context().close();
}

/* ---------- teacher (desktop) ---------- */
{
  const p = await newPage({ width: 1280, height: 900 });
  await login(p, '老師：Iris', '**/teacher');
  await check('teacher home: today list and 4 counters', async () => {
    await p.getByRole('heading', { name: '今天的課' }).waitFor();
    for (const t of ['待確認收據', '改時間申請', '新學生', '免費諮詢']) await p.getByText(t, { exact: true }).first().waitFor();
  });
  await check('teacher: sidebar visible, bottom bar hidden at 1280px', async () => {
    assert(await p.locator('.side').isVisible() && !(await p.locator('.bnav').isVisible()), 'nav mode');
  });
  await check('Ctrl+K opens the command menu and navigates', async () => {
    await p.keyboard.press('Control+k');
    await p.getByPlaceholder('搜尋頁面或學生…').fill('付款');
    await p.keyboard.press('Enter');
    await p.waitForURL('**/teacher/payments');
  });
  await check('payments: receipt opens in a modal dialog; reject needs a reason', async () => {
    await p.getByRole('button', { name: '查看收據' }).first().click();
    const d = p.locator('dialog[open]'); await d.waitFor();
    await d.getByRole('button', { name: '退回' }).click();
    const sheet = p.getByRole('dialog', { name: '退回收據' }); await sheet.waitFor();
    assert(await sheet.getByRole('button', { name: '請填寫原因' }).isDisabled(), 'must require reason');
  });
  await check('requests: tabs render', async () => {
    await p.goto(BASE + '/teacher/requests');
    await p.getByRole('tab', { name: /改時間/ }).waitFor();
    await p.getByRole('tab', { name: /你的提議/ }).click();
    await p.getByRole('tab', { name: /新學生/ }).click();
  });
  await check('students: search filters; detail offers 通知學生繳學費', async () => {
    await p.goto(BASE + '/teacher/students');
    await p.getByLabel('搜尋學生').fill('小明');
    await p.getByRole('link', { name: /王小明/ }).click();
    await p.getByRole('link', { name: '通知學生繳學費' }).waitFor();
  });
  await check('adjust credits: reason required before saving', async () => {
    await p.goto(BASE + '/teacher/students/s1/adjust');
    const d = p.getByRole('dialog', { name: '調整堂數' }); await d.waitFor();
    assert(await d.getByRole('button', { name: '請選擇原因' }).isDisabled(), 'reason required');
    await d.getByRole('radio', { name: '補課' }).click();
    assert(await d.getByRole('button', { name: '確認調整' }).isEnabled(), 'should enable after a reason');
  });
  await check('availability: toggle a weekday shows a toast with 復原', async () => {
    await p.goto(BASE + '/teacher/availability');
    await p.getByRole('switch', { name: /開放預約/ }).first().click();
    await p.getByRole('status').getByRole('button', { name: '復原' }).waitFor();
  });
  await check('精彩片段: bad link is caught, ↑↓ reorders, delete offers 復原', async () => {
    await p.goto(BASE + '/teacher/reels');
    await p.locator('.rl-row').first().waitFor();
    assert((await p.locator('.rl-row').count()) === 3, 'demo reels');
    await p.getByRole('link', { name: '新增' }).first().click();
    await p.getByLabel(/Instagram 連結/).fill('https://youtube.com/watch?v=1');
    await p.getByRole('button', { name: '新增', exact: true }).click();
    await p.getByText(/這不是 Instagram Reels 連結/).waitFor();
    await p.getByRole('button', { name: '取消' }).click();
    await p.waitForURL(/\/teacher\/reels$/); await p.locator('.v-sheet').waitFor({ state: 'detached' });
    const first = await p.locator('.rl-t').first().textContent();
    await p.locator('.rl-handle').first().focus(); await p.keyboard.press('ArrowDown');
    await p.waitForFunction((t) => document.querySelectorAll('.rl-t')[1]?.textContent === t, first);
    await p.locator('.rl-ib.danger').first().click();
    await p.getByRole('status').getByRole('button', { name: '復原' }).waitFor();
  });
  await check('teacher pages: axe is clean', async () => {
    for (const path of ['/teacher', '/teacher/calendar', '/teacher/students', '/teacher/requests', '/teacher/payments', '/teacher/consults', '/teacher/availability', '/teacher/reels']) {
      await p.goto(BASE + path); await p.waitForTimeout(500); await axe(p, path);
    }
  });
  await check('reduced motion: animations are off', async () => {
    await p.emulateMedia({ reducedMotion: 'reduce' }); await p.goto(BASE + '/');
    assert(await p.evaluate(() => getComputedStyle(document.querySelector('.l-sec') ?? document.body).animationName === 'none'), 'animation still on');
  });
  await p.context().close();
}

/* ---------- consultation-qualified single lesson ---------- */
{
  const p = await newPage({ width: 1280, height: 900 });
  await check('single lesson: Iris confirms consultation; student can choose 1 or 4 lessons and submits NT$1,500', async () => {
    await login(p, '老師：Iris', '**/teacher');
    await p.goto(BASE + '/teacher/students/s1/edit');
    const dialog = p.getByRole('dialog', { name: '編輯學生' });
    const completed = dialog.getByRole('checkbox', { name: '已完成諮詢／面談' });
    await completed.waitFor();
    assert(!await completed.isChecked(), 'consultation must default to unconfirmed');
    await completed.click();
    await p.getByText('已更新諮詢／面談狀態', { exact: true }).waitFor();
    assert((await p.evaluate(() => fetch('/api/teacher/students/s1').then((r) => r.json()))).consultationCompleted, 'teacher confirmation not persisted');
    assert(await completed.isChecked(), 'consultation checkbox did not stay checked');
    await axe(p, 'consultation editor', '.v-sheet');
    await dialog.getByRole('button', { name: '關閉' }).click();
    await dialog.waitFor({ state: 'detached' });
    // Stay within the SPA so the in-memory demo data survives the account switch.
    await p.locator('.side').getByRole('link', { name: '更多' }).click();
    const signedOut = p.waitForResponse((r) => r.url().endsWith('/api/auth/logout'));
    await p.getByRole('button', { name: '登出', exact: true }).click();
    await signedOut;
    await p.getByRole('link', { name: '登入', exact: true }).first().click();
    await p.getByRole('button', { name: '學生：王小明' }).click();
    await p.waitForURL('**/app');
    await p.locator('.side').getByRole('link', { name: '堂數與付款' }).click();
    const single = p.getByRole('radio', { name: /單堂課 · 1 堂/ });
    const four = p.getByRole('radio', { name: /方案 · 4 堂/ });
    await single.waitFor(); await four.waitFor();
    assert((await single.innerText()).includes('1,500'), 'single lesson price must be NT$1,500');
    await four.click(); assert(await four.getAttribute('aria-checked') === 'true', '4 lessons cannot be selected');
    await single.click();
    await axe(p, 'qualified quota');
    await p.setInputFiles('#rc', { name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') });
    const response = p.waitForResponse((r) => r.url().endsWith('/api/student/payments') && r.request().method() === 'POST');
    await p.getByRole('button', { name: '上傳收據' }).click();
    const receipt = await (await response).json();
    assert(receipt.packageSize === 1 && receipt.amount === 1500 && receipt.trial, 'wrong package or amount');
    await single.waitFor({ state: 'detached' });
    await four.waitFor();
    assert(!(await me(p)).trialAvailable, 'pending purchase must consume single lesson availability');
  });
  await p.context().close();
}

await check('no uncaught page errors', async () => assert(errors.length === 0, errors.join(' | ')));
await browser.close();
for (const [s, n, m] of results) console.log(`${s === 'PASS' ? '✓' : '✗'} ${n}${m ? `  — ${m}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
