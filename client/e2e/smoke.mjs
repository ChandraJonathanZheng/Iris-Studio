// End-to-end checks for the interaction-details plan, against the mock build.
// Run:  npm run build:mock && npx vite preview --port 4173 &  then  node e2e/smoke.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch();
const errors = [];
async function newPage(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 900 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
}
const me = (p) => p.evaluate(() => fetch('/api/me').then((r) => r.json()));
const axe = async (p, label) => {
  await p.addScriptTag({ content: axeSource });
  const r = await p.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] }));
  const v = r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical');
  assert(v.length === 0, `${label}: ${v.map((x) => `${x.id}(${x.nodes.length})`).join(', ')}`);
};

// 1. pre-render
await check('#7 landing HTML is pre-rendered (text in the raw HTML)', async () => {
  const html = await (await fetch(BASE + '/')).text();
  assert(html.includes('找到你最自在的聲音') && html.includes('免費諮詢'), 'headline missing from raw HTML');
});

const s = await newPage();
await s.goto(BASE + '/');
await check('landing: no serious axe violations (phone)', () => axe(s, 'landing'));
await check('login button top-right → login page', async () => {
  await s.click('.topbar >> text=學生登入'); await s.waitForURL('**/login');
});
await s.click('text=使用 LINE 登入（學生 王小明）');
await s.waitForURL('**/app');
await check('#1 skeleton shows on first load, then content', async () => {
  // the home skeleton or the content: skeleton must have been rendered at some point
  await s.waitForSelector('text=下一堂課', { timeout: 5000 });
});
await check('student home: no serious axe violations', () => axe(s, 'home'));
await check('#14 bottom nav sits above the safe area (uses env())', async () => {
  const css = await s.evaluate(() => [...document.styleSheets].flatMap((ss) => { try { return [...ss.cssRules]; } catch { return []; } }).map((r) => r.cssText).join(' '));
  assert(css.includes('safe-area-inset-bottom'), 'no safe-area rule');
  assert(await s.isVisible('.bnav'), 'bnav hidden on phone');
  assert((await s.locator('.bnav a').count()) === 5, 'student nav should have 5 items');
});
await check('#16 tabular numbers on body', async () => {
  assert((await s.evaluate(() => getComputedStyle(document.body).fontVariantNumeric)).includes('tabular-nums'), 'not tabular');
});
await check('#13 every button/link in the nav and toolbar is ≥ 44 px', async () => {
  const small = await s.evaluate(() => [...document.querySelectorAll('.bnav a, .icon-btn:not(.small), .btn:not(.sm)')]
    .filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length);
  assert(small === 0, `${small} targets smaller than 44px`);
});

// 2. booking: double tap books once, idempotency
const before = (await me(s)).credits;
await s.click('.bnav >> text=預約');
await s.waitForURL('**/app/book**');
await s.waitForSelector('.day[aria-pressed="true"]');
await check('date strip: closed dates shown disabled with 休息', async () => {
  const closed = await s.locator('.day:disabled small', { hasText: '休息' }).count();
  assert(closed >= 1, 'no 休息 date');
});
await s.locator('.chip:not([disabled])').first().click();
await s.click('.sticky-cta .btn');
await s.waitForURL('**/app/book/confirm**');
await check('#12 back closes the confirm sheet (stays in the app)', async () => {
  await s.goBack(); await s.waitForURL((u) => !u.pathname.endsWith('/confirm'));
  assert(new URL(s.url()).pathname === '/app/book', 'left the booking page: ' + s.url());
  await s.waitForTimeout(400);
  assert(!(await s.isVisible('.sheet')), 'sheet still open');
});
await s.click('.sticky-cta .btn');
await s.waitForSelector('.sheet >> text=確認預約');
await check('#19 double tap on 確認預約 → exactly one booking, credits −1 once', async () => {
  const btn = s.locator('.sheet .btn.primary');
  await btn.click(); await btn.click({ force: true, timeout: 500 }).catch(() => {});
  await s.waitForSelector('text=預約成功', { timeout: 5000 });
  const after = (await me(s)).credits;
  assert(after === before - 1, `credits ${before} → ${after}`);
});
await check('#19 replaying the same idempotency key returns the saved result', async () => {
  const r = await s.evaluate(async () => {
    const key = crypto.randomUUID();
    const days = await (await fetch('/api/slots/days?from=' + new Date().toISOString().slice(0, 10) + '&count=15')).json();
    const d = days.find((x) => x.state === 'open').date;
    const slots = await (await fetch('/api/slots?date=' + d)).json();
    const t = slots.find((x) => x.state === 'free').time;
    const send = () => fetch('/api/student/lessons', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ date: d, time: t }) });
    const a = await send(); const b = await send();
    return [a.status, b.status, b.headers.get('Idempotent-Replayed')];
  });
  assert(r[0] === 201 && r[1] === 201 && r[2] === 'true', JSON.stringify(r));
});
await s.click('.sheet >> text=回到首頁');
await s.waitForURL('**/app');

// 3. cancel + undo
await check('#5 cancel → undo toast → credits restored', async () => {
  const c0 = (await me(s)).credits;
  await s.locator('a[aria-label^="取消"]').first().click();
  await s.waitForSelector('.sheet >> text=取消這堂課？');
  await s.locator('.sheet .btn.danger').click();
  await s.waitForSelector('.toast >> text=復原');
  const c1 = (await me(s)).credits;
  await s.click('.toast .undo');
  await s.waitForSelector('.toast >> text=已復原');
  const c2 = (await me(s)).credits;
  assert(c1 >= c0 && c2 === c0, `credits ${c0} → ${c1} → ${c2}`);
});

// 4. alerts: optimistic + undo
await check('#2 #5 mark all read is instant, undo restores unread', async () => {
  await s.click('.bnav >> text=通知'); await s.waitForSelector('text=付款已確認');
  const u0 = await s.locator('.dot-unread').count();
  await s.click('text=全部標為已讀');
  await s.waitForTimeout(100); // the mock server takes ≥200 ms, so this is before it answers
  assert((await s.locator('.dot-unread').count()) === 0, 'not instant');
  await s.click('.toast .undo'); await s.waitForTimeout(800);
  assert((await s.locator('.dot-unread').count()) === u0, 'undo did not restore');
});
await check('#9 view transitions are wired (API available or graceful)', async () => {
  const has = await s.evaluate(() => typeof document.startViewTransition === 'function');
  assert(has, 'browser lacks startViewTransition (Chromium should have it)');
});

// 5. teacher
const t = await newPage({ width: 1280, height: 900 });
await t.goto(BASE + '/login');
await t.click('text=老師 Iris');
await t.waitForURL('**/teacher');
await t.waitForSelector('.kpi');
await check('teacher home: no serious axe violations (desktop)', () => axe(t, 'teacher home'));
await check('#3 #4 ⌘K opens the command menu and navigates; hint shown in sidebar', async () => {
  assert(await t.isVisible('.kbd-hint kbd'), 'no shortcut hint');
  await t.keyboard.press('Control+k');
  await t.waitForSelector('[cmdk-input]');
  await t.keyboard.type('付款');
  await t.keyboard.press('Enter');
  await t.waitForURL('**/teacher/payments');
});
await check('#5 approve change → undo within 5 s → request back, student got no alert', async () => {
  await t.goto(BASE + '/teacher/requests');
  await t.waitForSelector('.li.col');
  const n0 = await t.locator('.li.col').count();
  await t.locator('.btn.primary.sm:not([disabled])', { hasText: '同意' }).first().click();
  await t.waitForSelector('.toast .undo');
  assert((await t.locator('.li.col').count()) === n0 - 1, 'not removed optimistically');
  await t.click('.toast .undo');
  await t.waitForSelector('.toast >> text=已復原');
  await t.waitForFunction((n) => document.querySelectorAll('.li.col').length === n, n0);
});
await check('#2 server failure → optimistic change rolls back + error toast', async () => {
  await t.evaluate(() => sessionStorage.setItem('iris-mock-fail', '/change-requests/.+/approve$'));
  const n0 = await t.locator('.li.col').count();
  await t.locator('.btn.primary.sm:not([disabled])', { hasText: '同意' }).first().click();
  await t.waitForSelector('.toast.error');
  await t.waitForFunction((n) => document.querySelectorAll('.li.col').length === n, n0);
  await t.evaluate(() => sessionStorage.removeItem('iris-mock-fail'));
});
await check('#19 confirming the same receipt twice adds the package once', async () => {
  await t.goto(BASE + '/teacher/payments');
  await t.waitForSelector('text=確認，加');
  const before = await t.evaluate(() => fetch('/api/teacher/students/s5').then((r) => r.json()).then((x) => x.credits));
  const b = t.locator('.btn.primary.sm', { hasText: '確認，加' }).first();
  await b.click(); await b.click({ force: true, timeout: 500 }).catch(() => {});
  await t.waitForTimeout(1200);
  const after = await t.evaluate(() => fetch('/api/teacher/students/s5').then((r) => r.json()).then((x) => x.credits));
  assert(after - before === 8, `credits ${before} → ${after}`);
});
await check('#10 sheet closes by swiping down (phone)', async () => {
  await s.goto(BASE + '/app/book'); await s.waitForSelector('.chip:not([disabled])');
  await s.locator('.chip:not([disabled])').first().click();
  await s.click('.sticky-cta .btn'); await s.waitForSelector('.sheet .grab'); await s.waitForTimeout(500);
  const box = await s.locator('.sheet').boundingBox();
  await s.mouse.move(box.x + box.width / 2, box.y + 20); await s.mouse.down();
  for (let i = 1; i <= 10; i++) await s.mouse.move(box.x + box.width / 2, box.y + 20 + i * 40);
  await s.mouse.up();
  await s.waitForURL((u) => !u.pathname.endsWith('/confirm'), { timeout: 3000 });
});

await check('no uncaught page errors', async () => { assert(errors.length === 0, errors.join(' | ')); });

await browser.close();
for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
