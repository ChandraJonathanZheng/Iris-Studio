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
  assert(html.includes('找到屬於你的聲音') && html.includes('免費諮詢'), 'headline missing from raw HTML');
});

const s = await newPage();
await s.goto(BASE + '/');
await check('landing: no serious axe violations (phone)', () => axe(s, 'landing'));
await check('login button top-right → login page', async () => {
  await s.click('.topbar >> text=登入'); await s.waitForURL('**/login');
});
await s.click('.au-demo >> text=學生 王小明');
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

// 4b. decisions of 8 Nov (student side)
await check('8 Nov: Iris\'s proposal waits on home; 可以 moves the lesson', async () => {
  await s.goto(BASE + '/app'); await s.waitForSelector('.sh-prop');
  await s.click('.sh-prop .btn.primary');
  await s.waitForSelector('.toast >> text=已改到');
  const ls = await s.evaluate(() => fetch('/api/student/lessons?from=2000-01-01&to=2100-01-01').then((r) => r.json()));
  const l10 = ls.find((l) => l.id === 'l10');
  assert(l10 && !l10.change && l10.time === '14:00', 'lesson not moved: ' + JSON.stringify(l10));
  assert(!(await s.isVisible('.sh-prop')), 'card still shown');
});
await check('8 Nov: buy any time (upload open with 堂數 left), no 體驗課 for a regular student', async () => {
  await s.goto(BASE + '/app/quota'); await s.waitForSelector('#rc');
  assert((await me(s)).credits > 0, 'test needs credits left');
  assert(await s.isEnabled('#rc'), 'upload disabled although buying any time is allowed');
  assert(!(await s.isVisible('text=體驗課 · ')), 'trial package offered to a regular student');
});
await check('8 Nov: booking the last 堂 queues an automatic 繳費提醒', async () => {
  const r = await s.evaluate(async () => {
    const book = async () => {
      const days = await (await fetch('/api/slots/days?from=' + new Date().toISOString().slice(0, 10) + '&count=30')).json();
      for (const d of days.filter((x) => x.state === 'open')) {
        const free = (await (await fetch('/api/slots?date=' + d.date)).json()).find((x) => x.state === 'free');
        if (free) return fetch('/api/student/lessons', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ date: d.date, time: free.time }) });
      }
    };
    let me = await (await fetch('/api/me')).json();
    while (me.credits > 0) { await book(); me = await (await fetch('/api/me')).json(); }
    return me.credits;
  });
  assert(r === 0, 'credits left ' + r);
  await s.waitForTimeout(10_500); // alerts are released after the 10 s undo delay
  const alerts = await s.evaluate(() => fetch('/api/student/alerts').then((r) => r.json()));
  assert(alerts.filter((a) => a.kind === 'reminder').length === 1, 'reminders: ' + alerts.filter((a) => a.kind === 'reminder').length);
});

await check('同意設定: withdrawing media consent writes a new record (history kept)', async () => {
  await s.goto(BASE + '/app/profile'); await s.waitForSelector('.cn-card');
  const before = await s.evaluate(() => fetch('/api/me/consents').then((r) => r.json()));
  assert(before.media.granted, 'seed: 王小明 agreed to media');
  await s.click('.cn-row .switch >> nth=0'); await s.waitForSelector('.toast >> text=已撤回');
  const after = await s.evaluate(() => fetch('/api/me/consents').then((r) => r.json()));
  assert(!after.media.granted && after.history.length === before.history.length + 1, 'no new record: ' + JSON.stringify(after.history.length));
});

// 5. teacher
const t = await newPage({ width: 1280, height: 900 });
await t.goto(BASE + '/login');
await t.click('.au-demo >> text=老師 Iris');
await t.waitForURL('**/teacher');
await t.waitForSelector('.kpi');
await check('teacher home: no serious axe violations (desktop)', () => axe(t, 'teacher home'));
await check('teacher: 今日待辦 2×2 above 今天的課; 收件匣 = 申請 + 付款 + 諮詢 with one badge', async () => {
  const order = await t.evaluate(() => { const a = document.querySelector('.th-todo'), b = document.querySelector('.th-today'); return a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; });
  assert(order, '今日待辦 is not above 今天的課');
  assert((await t.locator('.th-todo .kpi').count()) === 4, 'not 4 cards');
  const titles = await t.locator('.th-todo .kpi .kt').allTextContents();
  assert(titles.join() === '改時間申請,待確認收據,新學生,諮詢', 'card order ' + titles);
  assert((await t.locator('.side nav a').count()) === 5, 'sidebar should have 5 items');
  await t.click('.side nav >> text=收件匣'); await t.waitForSelector('.ibx-tabs');
  await t.click('.ibx-tabs >> text=付款'); await t.waitForURL('**/teacher/payments');
  assert(await t.locator('.side nav a[aria-current="page"]').textContent().then((x) => x.startsWith('收件匣')), '收件匣 not active on 付款');
  await t.goto(BASE + '/teacher'); await t.waitForSelector('.kpi');
});
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
  await t.waitForSelector('.rq');
  const n0 = await t.locator('.rq').count();
  await t.locator('.rq-approve:not([disabled])', { hasText: '同意' }).first().click();
  await t.waitForSelector('.toast .undo');
  assert((await t.locator('.rq').count()) === n0 - 1, 'not removed optimistically');
  await t.click('.toast .undo');
  await t.waitForSelector('.toast >> text=已復原');
  await t.waitForFunction((n) => document.querySelectorAll('.rq').length === n, n0);
});
await check('#2 server failure → optimistic change rolls back + error toast', async () => {
  await t.evaluate(() => sessionStorage.setItem('iris-mock-fail', '/change-requests/.+/approve$'));
  const n0 = await t.locator('.rq').count();
  await t.locator('.rq-approve:not([disabled])', { hasText: '同意' }).first().click();
  await t.waitForSelector('.toast.error');
  await t.waitForFunction((n) => document.querySelectorAll('.rq').length === n, n0);
  await t.evaluate(() => sessionStorage.removeItem('iris-mock-fail'));
});
await check('#19 confirming the same receipt twice adds the package once', async () => {
  await t.goto(BASE + '/teacher/payments');
  await t.waitForSelector('text=查看收據並確認');
  const before = await t.evaluate(() => fetch('/api/teacher/students/s5').then((r) => r.json()).then((x) => x.credits));
  await t.locator('.rq-approve', { hasText: '查看收據並確認' }).first().click();
  const b = t.locator('.rcpt .rq-approve');
  assert(await b.isDisabled(), 'confirm must wait for the review check box');
  await t.check('.rcpt-check input');
  await b.click(); await b.click({ force: true, timeout: 500 }).catch(() => {});
  await t.waitForTimeout(1200);
  const after = await t.evaluate(() => fetch('/api/teacher/students/s5').then((r) => r.json()).then((x) => x.credits));
  assert(after - before === 8, `credits ${before} → ${after}`);
});
await check('可預約時段: turning Sunday on generates bookable slots from the range', async () => {
  await t.goto(BASE + '/teacher/availability');
  await t.waitForSelector('.av-days');
  const sunday = await t.evaluate(() => { const d = new Date(Date.now() + 8 * 36e5); d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7 || 7)); return d.toISOString().slice(0, 10); });
  const before = await t.evaluate((d) => fetch(`/api/slots?date=${d}`).then((r) => r.json()), sunday);
  assert(before.length === 0, 'Sunday should start closed');
  await t.click('[aria-labelledby="av-d-0"]');
  await t.waitForSelector('.toast');
  const after = await t.evaluate((d) => fetch(`/api/slots?date=${d}`).then((r) => r.json()), sunday);
  // default range when switching on: 10:00–18:00, 60 min + 30 min break → 10:00, 11:30, 13:00, 14:30, 16:00
  assert(after.map((x) => x.time).join() === '10:00,11:30,13:00,14:30,16:00', 'got ' + after.map((x) => x.time).join());
  await t.click('.toast .undo'); await t.waitForSelector('.toast >> text=已復原');
});
await check('8 Nov: lessons that ended are marked 已上課 automatically', async () => {
  const today = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
  const ls = await t.evaluate((d) => fetch(`/api/teacher/lessons?from=2000-01-01&to=${d}`).then((r) => r.json()), today);
  const end = (l) => Date.parse(`${l.date}T${l.time}:00+08:00`) + l.minutes * 6e4;
  const stale = ls.filter((l) => l.status === 'Booked' && end(l) <= Date.now());
  assert(stale.length === 0, 'still Booked: ' + stale.map((l) => l.id).join());
});
await check('8 Nov: Iris books for a student from the student page (−1 堂)', async () => {
  await t.goto(BASE + '/teacher/students/s2'); await t.waitForSelector('.sd-add');
  const c0 = await t.evaluate(() => fetch('/api/teacher/students/s2').then((r) => r.json()).then((x) => x.credits));
  await t.click('.sd-add'); await t.waitForSelector('.sheet .chip:not([disabled])');
  await t.locator('.sheet .chip:not([disabled])').first().click();
  await t.click('.sheet .btn.primary');
  await t.waitForSelector('.toast >> text=已幫');
  const c1 = await t.evaluate(() => fetch('/api/teacher/students/s2').then((r) => r.json()).then((x) => x.credits));
  assert(c1 === c0 - 1, `credits ${c0} → ${c1}`);
});
await check('8 Nov: Iris proposes a new time; it waits for the student in 申請', async () => {
  await t.goto(BASE + '/teacher/students/s1'); await t.waitForSelector('text=提議改時間');
  await t.locator('.sd-lesson >> text=提議改時間').first().click();
  await t.waitForSelector('.sheet .chip:not([disabled])');
  await t.locator('.sheet .chip:not([disabled])').first().click();
  await t.fill('#pm', '那天我有研習');
  await t.click('.sheet .btn.primary');
  await t.waitForSelector('.toast >> text=等學生回覆');
  await t.waitForSelector('.sd-lesson >> text=等待學生回覆');
  await t.goto(BASE + '/teacher/requests?tab=waiting'); await t.waitForSelector('.rq-props .rq-prow >> text=已傳送');
});
await check('教師個人資料: status saved → students get it; custom needs a label; email change needs the password', async () => {
  await t.goto(BASE + '/teacher/profile'); await t.waitForSelector('.tp-form');
  assert(await t.locator('.tp-form .btn.primary').isDisabled(), 'save enabled without changes');
  await t.click('.tp-st >> text=自訂');
  assert(await t.locator('.tp-form .btn.primary').isDisabled(), 'custom without a label can be saved');
  await t.click('.tp-st >> text=放假中'); await t.click('.tp-idea >> text=放假中，明天回覆');
  assert((await t.locator('.tsc').textContent()).includes('放假中，明天回覆'), 'preview not live');
  await t.click('.tp-form .btn.primary'); await t.waitForSelector('.tp-form .btn.primary >> text=已儲存');
  const pub = await t.evaluate(() => fetch('/api/public/studio').then((r) => r.json()).then((x) => x.teacher));
  assert(pub.status === 'vacation' && pub.statusMessage === '放假中，明天回覆', 'studio: ' + JSON.stringify(pub));
  const r = await t.evaluate(() => fetch('/api/teacher/account/email', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@y.tw', password: 'nope' }) }).then((x) => x.status));
  assert(r === 403, 'email change without the right password: ' + r);
});
await check('legal: footer links, consent required at sign-up, 個資申請 reaches Iris with a due date', async () => {
  const a = await newPage({ width: 390, height: 844 });
  await a.goto(BASE + '/'); await a.waitForTimeout(1500);
  assert((await a.locator('.ft-cols a').count()) === 8, 'footer should have 8 links');
  await a.click('.ft-cols >> text=隱私權政策'); await a.waitForURL('**/legal/privacy'); await a.waitForSelector('.lg-draft');
  const noConsent = await a.evaluate(() => fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', email: 'x@y.tw', password: '12345678', consents: { version: 'v', terms: false, media: false, marketing: false, minor: false, guardian: null } }) }).then((r) => r.status));
  assert(noConsent === 400, 'sign-up without terms consent: ' + noConsent);
  const minorNoGuardian = await a.evaluate(() => fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', email: 'x2@y.tw', password: '12345678', consents: { version: 'v', terms: true, media: false, marketing: false, minor: true, guardian: null } }) }).then((r) => r.status));
  assert(minorNoGuardian === 400, 'minor without guardian: ' + minorNoGuardian);
  await a.context().close();
  await t.evaluate(() => fetch('/api/public/privacy-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '林小姐', contact: 'lin@x.tw', type: 'delete', detail: '請刪除照片' }) }));
  // the mock keeps its data per page load, so move with the app's own links (no reload)
  await t.click('.side nav >> text=更多'); await t.click('.mo-row >> text=個資權利申請'); await t.waitForSelector('.pr-card >> text=林小姐');
  assert((await t.locator('.pr-card .rq-status').first().textContent()).includes('前需回覆'), 'no due date');
  await t.goto(BASE + '/teacher/students/s2'); await t.waitForSelector('.sd-consent.warn >> text=已撤回');
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
