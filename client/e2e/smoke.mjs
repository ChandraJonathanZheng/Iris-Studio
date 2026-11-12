// End-to-end checks for the UI (12 Nov 2026 demo design), against the mock build.
// Run:  npm run build:mock && npx vite preview --port 4173 --mode mock &  then  node e2e/smoke.mjs
// (or point BASE at `npm run dev:mock`). The mock keeps its data in memory: a full page load resets it,
// so flows that need earlier changes stay inside the SPA (client-side navigation).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, e.message.split('\n').slice(0, 3).join(' ')]); }
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
/** demo accounts on the login page: 學生 王小明 · 新學生（等待確認） · 老師 Iris */
const login = async (p, name, url) => { await p.goto(BASE + '/login'); await p.getByRole('button', { name, exact: true }).click(); await p.waitForURL(url); };
/** client-side navigation: keeps the in-memory mock data */
const spaGo = (p, path) => p.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
const signInAs = (p, as) => p.evaluate((who) => fetch('/api/auth/line/mock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ as: who }) }).then((r) => r.status), as);
const axe = async (p, label, selector = null) => {
  await p.addScriptTag({ content: axeSource });
  const r = await p.evaluate((selector) => window.axe.run(selector ?? document, { runOnly: ['wcag2a', 'wcag2aa'] }), selector);
  const v = r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical');
  assert(v.length === 0, `${label}: ${v.map((x) => `${x.id}(${x.nodes.length}) ${x.nodes[0].html.slice(0, 120)}`).join(', ')}`);
};
/** Sign out through the UI (clears the cached account) and back in from the login page — the SPA keeps the mock data. */
const switchUser = async (p, signIn) => {
  await p.getByRole('button', { name: '登出', exact: true }).first().click();
  await p.waitForURL((u) => new URL(u).pathname === '/');
  await p.locator('.lp-bar').getByRole('link', { name: '登入' }).click();
  await p.waitForURL('**/login');
  await signIn();
};
const toastUndo = (p) => p.locator('.toast').getByRole('button', { name: '復原' });

/* ---------- public ---------- */
{
  const p = await newPage();
  await check('landing: hero headline, 登入 + 免費諮詢 in the header, no horizontal scroll', async () => {
    await p.goto(BASE + '/');
    await p.getByRole('heading', { name: /找到屬於\s*你的聲音/ }).waitFor();
    assert(await p.locator('.lp-bar').getByRole('link', { name: '登入' }).isVisible(), '登入 missing');
    assert(await p.locator('.lp-bar').getByRole('link', { name: /免費諮詢/ }).isVisible(), 'CTA missing');
    assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow');
  });
  await check('landing: axe', async () => axe(p, 'landing'));
  await check('consult: button explains what is missing, then thank-you repeats channel + time', async () => {
    await p.goto(BASE + '/consult');
    assert(await p.getByRole('button', { name: '先填寫資訊喔！' }).isDisabled(), 'submit must wait for the form');
    await p.getByLabel(/^名字/).fill('測試');
    await p.locator('#cc').fill('test_line');
    await p.getByRole('radio', { name: '週末' }).click();
    await p.getByRole('button', { name: '和 Iris 聊聊' }).click();
    await p.getByRole('heading', { name: '訊息已送出，謝謝你！' }).waitFor();
    const t = await p.locator('.cs-sent').innerText();
    assert(t.includes('週末') && t.includes('LINE'), 'thank-you content');
  });
  await check('login: empty submit shows errors under the boxes; wrong password one generic error', async () => {
    await p.goto(BASE + '/login');
    await p.getByRole('button', { name: '登入', exact: true }).click();
    await p.getByText('請輸入 Email').waitFor();
    await p.getByText('請輸入密碼').waitFor();
    await p.getByLabel('Email').fill('xiaoming@demo.local');
    await p.getByLabel('密碼', { exact: true }).fill('wrongpass1');
    await p.getByRole('button', { name: '登入', exact: true }).click();
    await p.getByRole('alert').filter({ hasText: /不正確/ }).waitFor();
  });
  await check('register: required fields, live password checklist', async () => {
    await p.goto(BASE + '/register');
    await p.getByRole('button', { name: '建立帳號', exact: true }).click();
    await p.getByText('Email 不能空白。').waitFor();
    await p.getByText('姓名不能空白。').waitFor();
    await p.locator('#rw').fill('sing2026');
    assert((await p.locator('#pw-rules li.ok').count()) === 3, 'checklist should mark 8 chars, lower case, digit');
    await p.locator('#rw').fill('Sing2026');
    assert((await p.locator('#pw-rules li.ok').count()) === 4, 'all four rules');
  });
  await check('忘記密碼 → link → 設定新密碼 → back to login with 密碼已更新', async () => {
    await p.goto(BASE + '/forgot-password');
    await p.getByLabel(/^Email/).fill('xiaoming@demo.local');
    await p.getByRole('button', { name: '寄送重設連結' }).click();
    await p.getByRole('heading', { name: '請到信箱收信' }).waitFor();
    await p.getByRole('link', { name: '（示範）打開信中的連結' }).click();
    await p.getByRole('heading', { name: '設定新密碼' }).waitFor();
    await p.locator('#rp1').fill('short');
    await p.locator('#rp2').fill('short');
    await p.getByRole('button', { name: '確認', exact: true }).click();
    await p.getByText('密碼還不符合下面的條件。').waitFor();
    await p.locator('#rp1').fill('Sing2026new');
    await p.locator('#rp2').fill('Sing2026new');
    await p.getByRole('button', { name: '確認', exact: true }).click();
    await p.waitForURL('**/login');
    await p.getByText('密碼已更新，請用新密碼登入。').waitFor();
  });
  await check('reset link that is not valid shows 連結已失效', async () => {
    await p.goto(BASE + '/reset-password?token=nope');
    await p.getByRole('heading', { name: '連結已失效' }).waitFor();
  });
  await check('login: unauthenticated /app goes to /login', async () => {
    const q = await newPage(); await q.goto(BASE + '/app'); await q.waitForURL('**/login'); await q.context().close();
  });
  await p.context().close();
}

/* ---------- student ---------- */
{
  const p = await newPage();
  await login(p, '學生 王小明', '**/app');
  await check('student home: proposal card on top, quota card', async () => {
    await p.getByText('老師想調整上課時間').waitFor();
    await p.getByText('我的額度').waitFor();
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
    await p.locator('.chips .chip:not([disabled])').first().click();
    await p.locator('.sticky-cta').getByRole('button', { name: '確認預約' }).click();
    const d = p.getByRole('dialog'); await d.waitFor();
    await d.getByRole('button', { name: '確認預約' }).click();
    await p.getByText('預約成功').waitFor();
    assert((await me(p)).credits === before - 1, 'credit not deducted');
  });
  await check('back gesture closes a sheet instead of leaving the page', async () => {
    await p.goto(BASE + '/app/book');
    await p.locator('.chips .chip:not([disabled])').first().click();
    await p.locator('.sticky-cta').getByRole('button', { name: '確認預約' }).click();
    await p.getByRole('dialog').waitFor();
    await p.goBack();
    await p.getByRole('dialog').waitFor({ state: 'detached' });
    assert(p.url().includes('/app/book') && !p.url().includes('confirm'), p.url());
  });
  await check('cancel: sheet states refund rule, cancels, offers 復原', async () => {
    await p.goto(BASE + '/app');
    await p.getByRole('link', { name: /^取消預約：/ }).click();
    const d = p.getByRole('dialog'); await d.waitFor();
    assert(/堂數會退回|堂數不會退回/.test(await d.innerText()), 'refund policy missing');
    await d.getByRole('button', { name: /^取消 .+ 的課$/ }).click();
    await toastUndo(p).waitFor();
  });
  await check('回報: dialog states +1 堂 and 取消費 first; 返回 sends nothing; 確定 → 待審核; 撤回', async () => {
    await p.goto(BASE + '/app/calendar');
    await p.getByRole('tab', { name: '列表' }).click();
    await p.getByRole('button', { name: '過去' }).click();
    const sent = [];
    p.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/reports')) sent.push(r.url()); });
    await p.getByRole('button', { name: /^回報 / }).first().click();
    const dlg = p.locator('dialog.rpt[open]'); await dlg.waitFor();
    const text = await dlg.innerText();
    assert(text.includes('要申請取消這堂課嗎？') && text.includes('1 堂') && text.includes('NT$ 500'), 'effect line missing');
    await dlg.getByRole('button', { name: '返回' }).click();
    await dlg.waitFor({ state: 'detached' });
    assert(sent.length === 0, '返回 must not send a report');
    await p.getByRole('button', { name: /^回報 / }).first().click();
    await p.locator('dialog.rpt[open]').getByRole('button', { name: '確定' }).click();
    await p.getByText('已送出回報，老師確認後會通知你').waitFor();
    await p.locator('.tag', { hasText: '待審核' }).first().waitFor();
    await p.getByRole('button', { name: '撤回' }).first().click();
    await p.getByText('已撤回回報').waitFor();
  });
  await check('quota page: bank details, single lesson hidden before consultation', async () => {
    await p.goto(BASE + '/app/quota');
    await p.getByText('匯款帳號').waitFor();
    await p.getByRole('radio', { name: /^4 堂/ }).waitFor();
    assert(await p.getByRole('radio', { name: /單堂課/ }).count() === 0, 'single lesson must be hidden before consultation');
  });
  await check('calendar, alerts, profile: axe is clean', async () => {
    for (const path of ['/app/calendar', '/app/alerts', '/app/profile']) { await p.goto(BASE + path); await p.waitForTimeout(400); await axe(p, path); }
  });
  await p.context().close();
}

/* ---------- teacher (desktop) ---------- */
{
  const p = await newPage({ width: 1280, height: 900 });
  await login(p, '老師 Iris', '**/teacher');
  await check('teacher home: 今日待辦 tiles and today list', async () => {
    await p.getByRole('heading', { name: '今天的課' }).waitFor();
    for (const t of ['學生申請', '待確認收據', '新學生', '諮詢']) await p.locator('.kpi .kt', { hasText: t }).first().waitFor();
    assert((await p.locator('.kpi .kd').first().innerText()).includes('回報 1'), '學生申請 tile counts 回報');
  });
  await check('teacher: sidebar visible, bottom bar hidden at 1280px', async () => {
    assert(await p.locator('.side').isVisible() && !(await p.locator('.bnav').isVisible()), 'nav mode');
  });
  await check('Ctrl+K opens the command menu and navigates', async () => {
    await p.keyboard.press('Control+k');
    await p.getByPlaceholder('搜尋畫面、學生或動作…').fill('付款');
    await p.keyboard.press('Enter');
    await p.waitForURL('**/teacher/payments');
  });
  await check('payments: receipt modal needs the 我已核對 tick; reject needs a reason', async () => {
    await p.getByRole('button', { name: '查看收據並確認' }).first().click();
    const d = p.locator('dialog.rcpt[open]'); await d.waitFor();
    assert(await d.getByRole('button', { name: /^確認，加/ }).isDisabled(), 'confirm must wait for the tick');
    await d.getByRole('checkbox').check();
    assert(await d.getByRole('button', { name: /^確認，加/ }).isEnabled(), 'confirm enabled after tick');
    await d.getByRole('link', { name: '退回' }).click();
    const sheet = p.getByRole('dialog', { name: /^退回.+的收據$/ }); await sheet.waitFor();
    assert(await sheet.getByRole('button', { name: '退回並通知學生' }).isDisabled(), 'must require reason');
  });
  await check('requests: 回報 tab — approve (+1 堂, 取消費) with 復原; 婉拒 needs a reason', async () => {
    await p.goto(BASE + '/teacher/requests?tab=reports');
    const card = p.locator('.rq', { hasText: '林佳穎' }); await card.waitFor();
    assert((await card.innerText()).includes('NT$ 500'), 'effect line with fee');
    await card.getByRole('link', { name: '婉拒' }).click();
    const sheet = p.getByRole('dialog', { name: /的回報$/ }); await sheet.waitFor();
    assert(await sheet.getByRole('button', { name: '婉拒並通知學生' }).isDisabled(), 'decline needs a reason');
    await sheet.getByRole('button', { name: '返回' }).click();
    await sheet.waitFor({ state: 'detached' });
    await card.getByRole('button', { name: '同意' }).click();
    await toastUndo(p).waitFor();
    await card.waitFor({ state: 'detached' });
  });
  await check('取消費: the approved report shows on 林佳穎\'s 堂數與付款 and is added to the amount', async () => {
    try {
      await switchUser(p, async () => {
        await p.getByLabel('Email').fill('jiaying@demo.local');
        await p.getByLabel('密碼', { exact: true }).fill('demo1234');
        await p.getByRole('button', { name: '登入', exact: true }).click();
        await p.waitForURL('**/app');
      });
      await spaGo(p, '/app/quota');
      const due = p.locator('.fee-due'); await due.waitFor();
      const t = await due.innerText();
      assert(t.includes('未付取消費 NT$ 500') && /= NT\$ \d/.test(t), t);
    } finally {
      assert(await signInAs(p, 't1') === 200, 'back to Iris');
    }
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
    assert(await d.getByRole('button', { name: '儲存調整' }).isDisabled(), 'reason required');
    await d.getByRole('radio', { name: '補課' }).click();
    assert(await d.getByRole('button', { name: '儲存調整' }).isEnabled(), 'should enable after a reason');
  });
  await check('availability: toggle a weekday shows a toast with 復原', async () => {
    await p.goto(BASE + '/teacher/availability');
    await p.getByRole('switch', { name: '星期一' }).click();
    await toastUndo(p).waitFor();
  });
  await check('精彩片段: bad link is caught, ↑↓ reorders, delete offers 復原', async () => {
    await p.goto(BASE + '/teacher/reels');
    await p.locator('.rla-row').first().waitFor();
    assert((await p.locator('.rla-row').count()) === 3, 'demo reels');
    await p.getByRole('link', { name: '新增' }).first().click();
    await p.getByLabel(/Instagram 連結/).fill('https://youtube.com/watch?v=1');
    await p.getByRole('button', { name: '新增', exact: true }).click();
    await p.getByText(/這不是 Instagram Reels 連結/).waitFor();
    await p.getByRole('button', { name: '取消' }).click();
    await p.waitForURL(/\/teacher\/reels$/); await p.locator('.sheet').waitFor({ state: 'detached' });
    const first = await p.locator('.rla-t').first().textContent();
    await p.locator('.rla-handle').first().focus(); await p.keyboard.press('ArrowDown');
    await p.waitForFunction((t) => document.querySelectorAll('.rla-t')[1]?.textContent === t, first);
    await p.locator('.rla-ib.danger').first().click();
    await toastUndo(p).waitFor();
  });
  await check('teacher pages: axe is clean', async () => {
    for (const path of ['/teacher', '/teacher/calendar', '/teacher/students', '/teacher/requests', '/teacher/requests?tab=reports', '/teacher/payments', '/teacher/consults', '/teacher/availability', '/teacher/reels', '/teacher/more']) {
      await p.goto(BASE + path); await p.waitForTimeout(500); await axe(p, path);
    }
  });
  await p.context().close();
}

/* ---------- consultation-qualified single lesson ---------- */
{
  const p = await newPage({ width: 1280, height: 900 });
  await check('single lesson: Iris ticks 已完成諮詢／面談; student then sees 單堂課 NT$1,500 and buys it once', async () => {
    await login(p, '老師 Iris', '**/teacher');
    await p.goto(BASE + '/teacher/students/s1/edit');
    const dialog = p.getByRole('dialog', { name: '編輯 王小明' });
    const completed = dialog.getByRole('checkbox', { name: /已完成諮詢／面談/ });
    await completed.waitFor();
    assert(!await completed.isChecked(), 'consultation must default to unconfirmed');
    await completed.check();
    await dialog.getByRole('button', { name: '儲存' }).click();
    await p.getByText('王小明 已更新').waitFor();
    assert((await p.evaluate(() => fetch('/api/teacher/students/s1').then((r) => r.json()))).consultationCompleted, 'teacher confirmation not persisted');
    await dialog.waitFor({ state: 'detached' });
    await switchUser(p, async () => { await p.getByRole('button', { name: '學生 王小明', exact: true }).click(); await p.waitForURL('**/app'); });
    await spaGo(p, '/app/quota');
    const single = p.getByRole('radio', { name: /單堂課 · 1 堂/ });
    const four = p.getByRole('radio', { name: /^4 堂/ });
    await single.waitFor(); await four.waitFor();
    assert((await p.locator('label.li', { has: single }).innerText()).includes('1,500'), 'single lesson price must be NT$1,500');
    await single.check();
    await axe(p, 'qualified quota');
    await p.setInputFiles('#rc', { name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') });
    const response = p.waitForResponse((r) => r.url().endsWith('/api/student/payments') && r.request().method() === 'POST');
    await p.getByRole('button', { name: '上傳匯款證明' }).click();
    const receipt = await (await response).json();
    assert(receipt.packageSize === 1 && receipt.amount === 1500 && receipt.trial, 'wrong package or amount');
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
