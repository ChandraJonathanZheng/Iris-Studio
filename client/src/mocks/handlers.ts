import { delay, http, HttpResponse } from 'msw';
import { addDays, compareSlot, fmtSlot, studioToday, weekday } from '../lib/date';
import type { Me, Overview, StudentDetail, StudentSummary } from '../lib/types';
import {
  ALERT_DELAY_MS, STUDIO, UNDO_MS, addAlert, db, dropQueuedAlerts, idem, isTaken, lessonDto, lessonStart,
  newId, slotPast, userById, validSlot, type MUser,
} from './db';

const SESSION = 'iris-mock-session';
const sessionUser = (): MUser | undefined => { try { return userById(sessionStorage.getItem(SESSION) ?? ''); } catch { return undefined; } };
const problem = (status: number, detail: string, code = 'error') => HttpResponse.json({ title: detail, detail, code }, { status });
const lag = () => delay(250 + Math.random() * 250);

function requireUser(role?: 'Student' | 'Teacher') {
  const u = sessionUser();
  if (!u) return { err: problem(401, '請先登入。', 'unauthorized') };
  if (role && u.role !== role) return { err: problem(403, '沒有權限。', 'forbidden') };
  if (role === 'Student' && u.status !== 'Active') return { err: problem(403, '帳號還在等待老師確認。', 'pending') };
  return { u };
}

/** #19 idempotency: same key + same body → same saved response, the action runs once */
async function idempotent(req: Request, userId: string, run: () => Promise<Response> | Response): Promise<Response> {
  const key = req.headers.get('Idempotency-Key');
  if (!key) return run();
  const hash = req.method + new URL(req.url).pathname + (await req.clone().text());
  const saved = idem.get(key);
  if (saved) {
    if (saved.userId !== userId || saved.hash !== hash) return problem(422, '同一個請求編號被用在不同的內容。', 'idempotency_mismatch');
    return HttpResponse.json(saved.body as object, { status: saved.status, headers: { 'Idempotent-Replayed': 'true' } });
  }
  const res = await run();
  if (res.status < 500) idem.set(key, { userId, hash, status: res.status, body: await res.clone().json().catch(() => null) });
  return res;
}

function meDto(u: MUser): Me {
  const mine = db.lessons.filter((l) => l.studentId === u.id);
  return {
    id: u.id, name: u.name, role: u.role, status: u.status, email: u.email, phone: u.phone, lineId: u.lineId, lineLinked: u.lineLinked,
    voiceType: u.voiceType, goal: u.goal, grade: u.grade, avatarUrl: null, credits: u.credits,
    booked: mine.filter((l) => l.status === 'Booked').length, attended: mine.filter((l) => l.status === 'Attended').length,
    packageSize: u.packageSize,
    unreadAlerts: db.alerts.filter((a) => a.userId === u.id && !a.read && a.sendAfter <= Date.now()).length,
  };
}
function summary(u: MUser): StudentSummary {
  const up = db.lessons.filter((l) => l.studentId === u.id && l.status === 'Booked' && !slotPast(l.date, l.time)).sort(compareSlot);
  return {
    id: u.id, name: u.name, status: u.status, credits: u.credits, booked: up.length,
    nextLesson: up[0] ? { date: up[0].date, time: up[0].time } : null,
    paymentPending: db.payments.some((p) => p.studentId === u.id && p.status === 'Pending'), lineId: u.lineId, voiceType: u.voiceType,
  };
}
const payDto = (p: (typeof db.payments)[number]) => ({ ...p, studentName: userById(p.studentId)?.name ?? '' });

export const handlers = [
  // Test hook: sessionStorage['iris-mock-fail'] = 'regex' makes matching requests fail with 500 (simulates a server error).
  http.all('/api/*', ({ request }) => {
    const re = sessionStorage.getItem('iris-mock-fail');
    if (re && new RegExp(re).test(new URL(request.url).pathname)) return problem(500, '伺服器暫時無法處理，請稍後再試。', 'server_error');
    return undefined;
  }),
  // ---------- public ----------
  http.get('/api/public/studio', () => HttpResponse.json(STUDIO)),
  http.post('/api/public/consults', async ({ request }) => {
    await lag();
    const b = (await request.json()) as { name: string; contact: string; preferredDate: string; topic: string };
    if (!b.name?.trim() || !b.contact?.trim() || !b.preferredDate) return problem(400, '請填寫名字、聯絡方式和日期。', 'validation');
    if (b.preferredDate < studioToday()) return problem(400, '日期不能早於今天。', 'validation');
    db.consults.unshift({ id: newId(), ...b, createdAt: new Date().toISOString(), contacted: false });
    return HttpResponse.json({ ok: true }, { status: 201 });
  }),

  // ---------- auth ----------
  http.get('/api/me', async () => { await delay(150); const u = sessionUser(); return HttpResponse.json(u ? meDto(u) : null); }),
  http.post('/api/auth/login', async ({ request }) => {
    await lag();
    const b = (await request.json()) as { email: string; password: string };
    const u = db.users.find((x) => x.email === b.email?.trim().toLowerCase() && x.password === b.password);
    if (!u) return problem(401, 'Email 或密碼不正確。', 'bad_credentials');
    sessionStorage.setItem(SESSION, u.id);
    return HttpResponse.json(meDto(u));
  }),
  // In production this is an OAuth redirect to LINE. The mock signs in as a demo account instead.
  http.post('/api/auth/line/mock', async ({ request }) => {
    await lag();
    const { as } = (await request.json()) as { as: string };
    const u = userById(as);
    if (!u) return problem(404, '找不到帳號。');
    sessionStorage.setItem(SESSION, u.id);
    return HttpResponse.json(meDto(u));
  }),
  http.post('/api/auth/logout', () => { sessionStorage.removeItem(SESSION); return new HttpResponse(null, { status: 204 }); }),

  // ---------- slots ----------
  http.get('/api/slots/days', async ({ request }) => {
    await lag();
    const url = new URL(request.url);
    const from = url.searchParams.get('from')!; const count = Number(url.searchParams.get('count') ?? 15);
    const today = studioToday();
    return HttpResponse.json(Array.from({ length: count }, (_, i) => {
      const d = addDays(from, i);
      if (d < today) return { date: d, state: 'past' };
      if (STUDIO.closedWeekdays.includes(weekday(d))) return { date: d, state: 'closed' };
      const open = STUDIO.slots.filter((t) => !slotPast(d, t));
      if (open.length === 0) return { date: d, state: 'past' };
      return { date: d, state: open.every((t) => isTaken(d, t)) ? 'full' : 'open' };
    }));
  }),
  http.get('/api/slots', async ({ request }) => {
    await lag();
    const d = new URL(request.url).searchParams.get('date')!;
    if (STUDIO.closedWeekdays.includes(weekday(d))) return HttpResponse.json([]);
    return HttpResponse.json(STUDIO.slots.map((t) => ({ time: t, state: slotPast(d, t) ? 'past' : isTaken(d, t) ? 'full' : 'free' })));
  }),

  // ---------- student ----------
  http.get('/api/student/lessons', async ({ request }) => {
    await lag();
    const r = requireUser('Student'); if (r.err) return r.err;
    const url = new URL(request.url); const from = url.searchParams.get('from')!; const to = url.searchParams.get('to')!;
    return HttpResponse.json(db.lessons.filter((l) => l.studentId === r.u.id && l.date >= from && l.date <= to).sort(compareSlot).map(lessonDto));
  }),
  http.post('/api/student/lessons', async ({ request }) => {
    const r = requireUser('Student'); if (r.err) return r.err;
    return idempotent(request, r.u.id, async () => {
      await delay(700);
      const b = (await request.clone().json()) as { date: string; time: string };
      const bad = validSlot(b.date, b.time); if (bad) return problem(400, bad, 'invalid_slot');
      if (r.u.credits <= 0) return problem(409, '堂數已用完，請先購買新方案。', 'no_credits');
      if (isTaken(b.date, b.time)) return problem(409, '這個時段剛被別人預約了。沒有扣堂數，請選其他時段。', 'slot_taken');
      const l = { id: newId(), studentId: r.u.id, date: b.date, time: b.time, status: 'Booked' as const };
      db.lessons.push(l); r.u.credits -= 1;
      return HttpResponse.json({ lesson: lessonDto(l), creditsLeft: r.u.credits }, { status: 201 });
    });
  }),
  http.post('/api/student/lessons/:id/cancel', async ({ params }) => {
    await delay(500);
    const r = requireUser('Student'); if (r.err) return r.err;
    const l = db.lessons.find((x) => x.id === params.id && x.studentId === r.u.id);
    if (!l || l.status !== 'Booked') return problem(404, '找不到這堂課。');
    if (slotPast(l.date, l.time)) return problem(409, '已經開始的課不能取消。');
    const refunded = lessonStart(l) - Date.now() >= STUDIO.cancelHours * 36e5;
    l.status = 'Cancelled'; l.cancelledAt = Date.now(); l.refunded = refunded;
    if (refunded) r.u.credits += 1;
    db.changes.filter((c) => c.lessonId === l.id && c.status === 'Open').forEach((c) => (c.status = 'Withdrawn'));
    return HttpResponse.json({ refunded, creditsLeft: r.u.credits, undoUntil: new Date(Date.now() + UNDO_MS).toISOString() });
  }),
  http.post('/api/student/lessons/:id/undo-cancel', async ({ params }) => {
    await lag();
    const r = requireUser('Student'); if (r.err) return r.err;
    const l = db.lessons.find((x) => x.id === params.id && x.studentId === r.u.id);
    if (!l || l.status !== 'Cancelled' || !l.cancelledAt || Date.now() - l.cancelledAt > UNDO_MS) return problem(409, '已超過可以復原的時間。', 'undo_expired');
    if (isTaken(l.date, l.time)) return problem(409, '這個時段已經被別人預約了。', 'slot_taken');
    if (l.refunded) r.u.credits -= 1;
    l.status = 'Booked'; l.cancelledAt = undefined;
    return new HttpResponse(null, { status: 204 });
  }),
  http.post('/api/student/lessons/:id/change-requests', async ({ params, request }) => {
    await delay(500);
    const r = requireUser('Student'); if (r.err) return r.err;
    const l = db.lessons.find((x) => x.id === params.id && x.studentId === r.u.id && x.status === 'Booked');
    if (!l) return problem(404, '找不到這堂課。');
    if (db.changes.some((c) => c.lessonId === l.id && c.status === 'Open')) return problem(409, '這堂課已經有一個改時間申請。');
    const b = (await request.json()) as { date: string; time: string; reason: string };
    const bad = validSlot(b.date, b.time); if (bad) return problem(400, bad);
    if (isTaken(b.date, b.time)) return problem(409, '這個時段已經有人了。', 'slot_taken');
    db.changes.push({ id: newId(), lessonId: l.id, toDate: b.date, toTime: b.time, reason: b.reason ?? '', status: 'Open' });
    return HttpResponse.json({ ok: true }, { status: 201 });
  }),
  http.post('/api/student/change-requests/:id/withdraw', async ({ params }) => {
    await lag();
    const r = requireUser('Student'); if (r.err) return r.err;
    const c = db.changes.find((x) => x.id === params.id && x.status === 'Open');
    if (!c) return problem(404, '找不到申請。');
    c.status = 'Withdrawn';
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/student/alerts', async () => {
    await lag();
    const r = requireUser('Student'); if (r.err) return r.err;
    return HttpResponse.json(db.alerts.filter((a) => a.userId === r.u.id && a.sendAfter <= Date.now()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ userId: _u, sendAfter: _s, source: _src, ...a }) => a));
  }),
  http.post('/api/student/alerts/read', async ({ request }) => {
    await delay(200);
    const r = requireUser('Student'); if (r.err) return r.err;
    const b = (await request.json()) as { ids: string[]; read: boolean };
    db.alerts.forEach((a) => { if (a.userId === r.u.id && b.ids.includes(a.id)) a.read = b.read; });
    return new HttpResponse(null, { status: 204 });
  }),
  http.put('/api/student/profile', async ({ request }) => {
    await lag();
    const r = requireUser('Student'); if (r.err) return r.err;
    const b = (await request.json()) as Partial<MUser>;
    // only safe fields: never credits/status/grade (mass assignment)
    (['name', 'email', 'phone', 'lineId', 'voiceType', 'goal'] as const).forEach((k) => { if (k in b) (r.u as unknown as Record<string, unknown>)[k] = b[k] ?? null; });
    return HttpResponse.json(meDto(r.u));
  }),
  http.get('/api/student/payments', async () => {
    await lag();
    const r = requireUser('Student'); if (r.err) return r.err;
    return HttpResponse.json(db.payments.filter((p) => p.studentId === r.u.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).map(payDto));
  }),
  http.post('/api/student/payments', async ({ request }) => {
    const r = requireUser('Student'); if (r.err) return r.err;
    return idempotent(request, r.u.id, async () => {
      await delay(800);
      if (r.u.credits > 0) return problem(409, '還有堂數可以用，用完後才能購買新方案。', 'has_credits');
      if (db.payments.some((p) => p.studentId === r.u.id && p.status === 'Pending')) return problem(409, '已經有一張收據在等老師確認。', 'pending_exists');
      const form = await request.clone().formData();
      const size = Number(form.get('packageSize'));
      const pkg = STUDIO.packages.find((p) => p.size === size); if (!pkg) return problem(400, '請選擇方案。');
      const file = form.get('receipt'); if (!(file instanceof File) || file.size === 0) return problem(400, '請上傳收據圖片。');
      if (file.size > 5 * 1024 * 1024) return problem(400, '圖片不能超過 5 MB。');
      const p = { id: newId(), studentId: r.u.id, packageSize: size, amount: pkg.price, status: 'Pending' as const, uploadedAt: new Date().toISOString(), note: (form.get('note') as string) || null, rejectReason: null, receiptUrl: URL.createObjectURL(file), lqip: null };
      db.payments.push(p);
      return HttpResponse.json(payDto(p), { status: 201 });
    });
  }),

  // ---------- teacher ----------
  http.get('/api/teacher/overview', async () => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const t = studioToday();
    const pend = db.payments.filter((p) => p.status === 'Pending');
    const o: Overview = {
      today: db.lessons.filter((l) => l.date === t && l.status !== 'Cancelled').sort(compareSlot).map(lessonDto),
      counts: {
        receipts: pend.length, receiptsAmount: pend.reduce((s, p) => s + p.amount, 0),
        changes: db.changes.filter((c) => c.status === 'Open').length,
        applications: db.users.filter((u) => u.status === 'Pending' && !u.declined).length,
        consults: db.consults.filter((c) => !c.contacted).length,
      },
      outOfQuota: db.users.filter((u) => u.role === 'Student' && u.status === 'Active' && u.credits === 0).map(summary),
    };
    return HttpResponse.json(o);
  }),
  http.get('/api/teacher/lessons', async ({ request }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const url = new URL(request.url); const from = url.searchParams.get('from')!; const to = url.searchParams.get('to')!;
    return HttpResponse.json(db.lessons.filter((l) => l.date >= from && l.date <= to).sort(compareSlot).map(lessonDto));
  }),
  http.post('/api/teacher/lessons/:id/cancel', async ({ params }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const l = db.lessons.find((x) => x.id === params.id && x.status === 'Booked'); if (!l) return problem(404, '找不到這堂課。');
    l.status = 'Cancelled'; l.cancelledAt = Date.now(); l.refunded = true; l.byTeacher = true;
    const s = userById(l.studentId)!; s.credits += 1; // Iris's cancellations always refund
    addAlert(s.id, 'cancelled', '老師取消了一堂課', `${fmtSlot(l.date, l.time)} 已取消，堂數已退回。`, `cancel:${l.id}`);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post('/api/teacher/lessons/:id/undo-cancel', async ({ params }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const l = db.lessons.find((x) => x.id === params.id);
    if (!l || l.status !== 'Cancelled' || !l.cancelledAt || Date.now() - l.cancelledAt > UNDO_MS) return problem(409, '已超過可以復原的時間。', 'undo_expired');
    if (isTaken(l.date, l.time)) return problem(409, '這個時段已經被別人預約了。', 'slot_taken');
    l.status = 'Booked'; userById(l.studentId)!.credits -= 1; dropQueuedAlerts(`cancel:${l.id}`);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/teacher/students', async () => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    return HttpResponse.json(db.users.filter((u) => u.role === 'Student' && !u.declined).map(summary));
  }),
  http.get('/api/teacher/students/:id', async ({ params }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const u = userById(params.id as string); if (!u || u.role !== 'Student') return problem(404, '找不到學生。');
    const mine = db.lessons.filter((l) => l.studentId === u.id).sort(compareSlot);
    const d: StudentDetail = {
      ...summary(u), email: u.email, phone: u.phone, grade: u.grade, goal: u.goal, packageSize: u.packageSize,
      attended: mine.filter((l) => l.status === 'Attended').length,
      upcoming: mine.filter((l) => l.status === 'Booked' && !slotPast(l.date, l.time)).map(lessonDto),
      past: mine.filter((l) => l.status === 'Attended').reverse().map(lessonDto),
      payments: db.payments.filter((p) => p.studentId === u.id).map(payDto),
    };
    return HttpResponse.json(d);
  }),
  http.post('/api/teacher/students/:id/credits', async ({ params, request }) => {
    await delay(300);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const u = userById(params.id as string); if (!u) return problem(404, '找不到學生。');
    const { delta } = (await request.json()) as { delta: number };
    if (u.credits + delta < 0) return problem(409, '堂數不能小於 0。', 'negative');
    u.credits += delta;
    addAlert(u.id, 'added', '老師調整了你的堂數', `現在剩餘 ${u.credits} 堂。`);
    return HttpResponse.json({ credits: u.credits });
  }),
  http.get('/api/teacher/requests', async () => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    return HttpResponse.json({
      changes: db.changes.filter((c) => c.status === 'Open').map((c) => {
        const l = db.lessons.find((x) => x.id === c.lessonId)!;
        return { id: c.id, lessonId: l.id, studentId: l.studentId, studentName: userById(l.studentId)!.name, fromDate: l.date, fromTime: l.time, toDate: c.toDate, toTime: c.toTime, reason: c.reason, slotFree: !isTaken(c.toDate, c.toTime, l.id) && !slotPast(c.toDate, c.toTime), createdAt: new Date().toISOString() };
      }),
      applications: db.users.filter((u) => u.status === 'Pending' && !u.declined).map((u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt })),
    });
  }),
  http.post('/api/teacher/change-requests/:id/:action', async ({ params, request }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const c = db.changes.find((x) => x.id === params.id); if (!c) return problem(404, '找不到申請。');
    const l = db.lessons.find((x) => x.id === c.lessonId)!; const s = userById(l.studentId)!;
    if (params.action === 'undo') {
      if (!c.decidedAt || Date.now() - c.decidedAt > UNDO_MS) return problem(409, '已超過可以復原的時間。', 'undo_expired');
      if (c.status === 'Approved' && c.prev) { l.date = c.prev.date; l.time = c.prev.time; }
      c.status = 'Open'; c.decidedAt = undefined; dropQueuedAlerts(`change:${c.id}`);
      return new HttpResponse(null, { status: 204 });
    }
    if (c.status !== 'Open') return problem(409, '這個申請已經處理過了。');
    const { message } = (await request.json().catch(() => ({}))) as { message?: string | null };
    if (params.action === 'approve') {
      if (isTaken(c.toDate, c.toTime, l.id)) return problem(409, '新時段已被預約，只能婉拒。', 'slot_taken');
      c.prev = { date: l.date, time: l.time }; l.date = c.toDate; l.time = c.toTime; c.status = 'Approved';
      addAlert(s.id, 'approved', '老師同意改時間', `${fmtSlot(c.prev.date, c.prev.time)} 改到 ${fmtSlot(c.toDate, c.toTime)}。`, `change:${c.id}`);
    } else {
      c.status = 'Declined';
      addAlert(s.id, 'declined', '老師無法改到這個時間', message?.trim() ? message : `${fmtSlot(l.date, l.time)} 的課維持不變。`, `change:${c.id}`);
    }
    c.decidedAt = Date.now();
    return new HttpResponse(null, { status: 204 });
  }),
  http.post('/api/teacher/applications/:id/:action', async ({ params }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const u = userById(params.id as string); if (!u) return problem(404, '找不到申請。');
    const meta = u as MUser & { decidedAt?: number };
    if (params.action === 'undo') {
      if (!meta.decidedAt || Date.now() - meta.decidedAt > UNDO_MS) return problem(409, '已超過可以復原的時間。', 'undo_expired');
      u.status = 'Pending'; u.declined = false; meta.decidedAt = undefined; dropQueuedAlerts(`app:${u.id}`);
      return new HttpResponse(null, { status: 204 });
    }
    if (params.action === 'approve') { u.status = 'Active'; addAlert(u.id, 'welcome', '歡迎加入 Iris 聲樂工作室', '帳號已確認，可以開始預約。', `app:${u.id}`); }
    else u.declined = true;
    meta.decidedAt = Date.now();
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/teacher/payments', async ({ request }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const st = new URL(request.url).searchParams.get('status');
    return HttpResponse.json(db.payments.filter((p) => st === 'All' || p.status === st).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).map(payDto));
  }),
  http.post('/api/teacher/payments/:id/:action', async ({ params, request }) => {
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const run = async () => {
      await lag();
      const p = db.payments.find((x) => x.id === params.id); if (!p) return problem(404, '找不到收據。');
      const s = userById(p.studentId)!;
      if (params.action === 'undo') {
        if (!p.decidedAt || Date.now() - p.decidedAt > UNDO_MS) return problem(409, '已超過可以復原的時間。', 'undo_expired');
        if (p.status === 'Confirmed') { if (s.credits < p.packageSize) return problem(409, '學生已經用了部分堂數，無法復原。'); s.credits -= p.packageSize; }
        p.status = 'Pending'; p.rejectReason = null; p.decidedAt = undefined; dropQueuedAlerts(`pay:${p.id}`);
        return new HttpResponse(null, { status: 204 });
      }
      if (p.status !== 'Pending') return problem(409, '這張收據已經處理過了。', 'already_handled');
      const { reason } = (await request.clone().json().catch(() => ({}))) as { reason?: string | null };
      if (params.action === 'confirm') {
        p.status = 'Confirmed'; s.credits += p.packageSize; s.packageSize = p.packageSize;
        addAlert(s.id, 'payment', '付款已確認', `${p.packageSize} 堂已加入，現在剩餘 ${s.credits} 堂。`, `pay:${p.id}`);
      } else {
        if (!reason?.trim()) return problem(400, '請填寫退回原因。', 'validation');
        p.status = 'Rejected'; p.rejectReason = reason;
        addAlert(s.id, 'payment', '收據被退回', reason, `pay:${p.id}`);
      }
      p.decidedAt = Date.now();
      return HttpResponse.json({ ok: true });
    };
    return params.action === 'undo' ? run() : idempotent(request, r.u.id, run);
  }),
  http.get('/api/teacher/consults', async () => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    return HttpResponse.json(db.consults);
  }),
  http.post('/api/teacher/consults/:id/contacted', async ({ params, request }) => {
    await delay(200);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const c = db.consults.find((x) => x.id === params.id); if (!c) return problem(404, '找不到。');
    c.contacted = ((await request.json()) as { contacted: boolean }).contacted;
    return new HttpResponse(null, { status: 204 });
  }),
];

export const MOCK_ALERT_DELAY_MS = ALERT_DELAY_MS;
