import { delay, http, HttpResponse } from 'msw';
import { addDays, compareSlot, fmtSlot, studioToday } from '../lib/date';
import { rangeProblems, slotTimesFor, toMin } from '../lib/availability';
import type { Availability, Me, Overview, StudentDetail, StudentSummary } from '../lib/types';
import {
  ALERT_DELAY_MS, STUDIO, UNDO_MS, addAlert, availability, db, dropQueuedAlerts, settleAttendance, idem, isTaken, lessonDto, lessonStart,
  newId, slotPast, userById, validSlot, type MUser,
} from './db';

const SESSION = 'iris-mock-session';
const memory = new Map<string, string>();
const store = {
  getItem: (k: string) => { try { return sessionStorage.getItem(k); } catch { return memory.get(k) ?? null; } },
  setItem: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { memory.set(k, v); } },
  removeItem: (k: string) => { try { sessionStorage.removeItem(k); } catch { memory.delete(k); } },
};
const sessionUser = (): MUser | undefined => { try { return userById(store.getItem(SESSION) ?? ''); } catch { return undefined; } };
const problem = (status: number, detail: string, code = 'error') => HttpResponse.json({ title: detail, detail, code }, { status });
const lag = () => delay(250 + Math.random() * 250);

function requireUser(role?: 'Student' | 'Teacher') {
  settleAttendance();
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
    classType: u.classType ?? 'private', trialAvailable: trialAvailable(u),
  };
}
/** 體驗 students can buy the trial package once (a rejected receipt doesn't count) */
const trialAvailable = (u: MUser) => (u.classType ?? 'private') === 'trial' && !db.payments.some((p) => p.studentId === u.id && p.trial && p.status !== 'Rejected');
function summary(u: MUser): StudentSummary {
  const up = db.lessons.filter((l) => l.studentId === u.id && l.status === 'Booked' && !slotPast(l.date, l.time)).sort(compareSlot);
  return {
    id: u.id, name: u.name, status: u.status, classType: u.classType ?? 'private', credits: u.credits, booked: up.length,
    nextLesson: up[0] ? { date: up[0].date, time: up[0].time } : null,
    paymentPending: db.payments.some((p) => p.studentId === u.id && p.status === 'Pending'), lineId: u.lineId, voiceType: u.voiceType,
  };
}
/** Automatic 繳費提醒 when a booking uses the last credit — same rules as the server (BookingService.AutoRemindAsync) */
function autoRemind(u: MUser, lessonId: string) {
  if (u.credits > 0) return;
  if (db.payments.some((p) => p.studentId === u.id && p.status === 'Pending')) return;
  const since = Date.now() - 24 * 36e5;
  if (db.alerts.some((a) => a.userId === u.id && a.kind === 'reminder' && Date.parse(a.createdAt) > since)) return;
  addAlert(u.id, 'reminder', '繳費提醒', '你的堂數已經用完了。想繼續上課的話，請到「堂數與付款」上傳匯款證明。', `auto-remind:${lessonId}`);
}
const payDto = (p: (typeof db.payments)[number]) => ({ ...p, studentName: userById(p.studentId)?.name ?? '' });

export const handlers = [
  // Test hook: sessionStorage['iris-mock-fail'] = 'regex' makes matching requests fail with 500 (simulates a server error).
  http.all('/api/*', ({ request }) => {
    const re = store.getItem('iris-mock-fail');
    if (re && new RegExp(re).test(new URL(request.url).pathname)) return problem(500, '伺服器暫時無法處理，請稍後再試。', 'server_error');
    return undefined;
  }),
  // ---------- public ----------
  http.get('/api/public/studio', () => HttpResponse.json({ ...STUDIO, lessonMinutes: availability.settings.lessonMinutes })),
  http.post('/api/public/consults', async ({ request }) => {
    await lag();
    const b = (await request.json()) as { name: string; contactType: 'line' | 'email'; contact: string; preferredTime: 'weekdayDay' | 'weekdayEvening' | 'weekend' | 'any'; topic: string };
    if (!b.name?.trim() || !b.contact?.trim()) return problem(400, '請填寫名字和聯絡方式。', 'validation');
    if (!['line', 'email'].includes(b.contactType) || !['weekdayDay', 'weekdayEvening', 'weekend', 'any'].includes(b.preferredTime)) return problem(400, '資料格式不正確。', 'validation');
    if (b.contactType === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.contact.trim())) return problem(400, '請填寫正確的 Email。', 'validation');
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
    store.setItem(SESSION, u.id);
    return HttpResponse.json(meDto(u));
  }),
  // In production this is an OAuth redirect to LINE. The mock signs in as a demo account instead.
  http.post('/api/auth/line/mock', async ({ request }) => {
    await lag();
    const { as } = (await request.json()) as { as: string };
    const u = userById(as);
    if (!u) return problem(404, '找不到帳號。');
    store.setItem(SESSION, u.id);
    return HttpResponse.json(meDto(u));
  }),
  // PRD AUTH-1: new account starts as Pending; the session starts right away so the user lands on /pending.
  http.post('/api/auth/register', async ({ request }) => {
    await lag();
    const b = (await request.json()) as { name: string; email: string; phone: string | null; password: string };
    const email = b.email?.trim().toLowerCase();
    if (!b.name?.trim() || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return problem(400, '請填寫姓名和正確的 Email。', 'validation');
    if ((b.password ?? '').length < 8) return problem(400, '密碼至少 8 個字元。', 'validation');
    if (db.users.some((u) => u.email === email)) return problem(409, '這個 Email 已經註冊過了，請直接登入。', 'email_taken');
    const u: MUser = { id: newId(), name: b.name.trim(), role: 'Student', status: 'Pending', email, password: b.password, phone: b.phone, lineId: null, lineLinked: false,
      voiceType: null, goal: null, grade: null, credits: 0, packageSize: 0, createdAt: new Date().toISOString(), classType: 'trial' };
    db.users.push(u);
    store.setItem(SESSION, u.id);
    return HttpResponse.json(meDto(u), { status: 201 });
  }),
  // Mock of "LINE Login for a new user": the real server creates a Pending user from the LINE profile.
  http.post('/api/auth/line/mock-register', async () => {
    await lag();
    const n = db.users.filter((u) => u.name.startsWith('LINE 新同學')).length + 1;
    const u: MUser = { id: newId(), name: `LINE 新同學 ${n}`, role: 'Student', status: 'Pending', email: null, phone: null, lineId: null, lineLinked: true,
      voiceType: null, goal: null, grade: null, credits: 0, packageSize: 0, createdAt: new Date().toISOString(), classType: 'trial' };
    db.users.push(u);
    store.setItem(SESSION, u.id);
    return HttpResponse.json(meDto(u), { status: 201 });
  }),
  http.post('/api/auth/logout', () => { store.removeItem(SESSION); return new HttpResponse(null, { status: 204 }); }),

  // ---------- slots ----------
  http.get('/api/slots/days', async ({ request }) => {
    await lag();
    const url = new URL(request.url);
    const from = url.searchParams.get('from')!; const count = Number(url.searchParams.get('count') ?? 15);
    const today = studioToday();
    return HttpResponse.json(Array.from({ length: count }, (_, i) => {
      const d = addDays(from, i);
      if (d < today) return { date: d, state: 'past' };
      if (d > addDays(today, availability.settings.advanceDays)) return { date: d, state: 'later' };
      const times = slotTimesFor(availability, d);
      if (times.length === 0) return { date: d, state: 'closed' };
      const open = times.filter((t) => !slotPast(d, t));
      if (open.length === 0) return { date: d, state: 'past' };
      return { date: d, state: open.every((t) => isTaken(d, t)) ? 'full' : 'open' };
    }));
  }),
  http.get('/api/slots', async ({ request }) => {
    await lag();
    const d = new URL(request.url).searchParams.get('date')!;
    if (d > addDays(studioToday(), availability.settings.advanceDays)) return HttpResponse.json([]);
    return HttpResponse.json(slotTimesFor(availability, d).map((t) => ({ time: t, state: slotPast(d, t) ? 'past' : isTaken(d, t) ? 'full' : 'free' })));
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
      const l = { id: newId(), studentId: r.u.id, date: b.date, time: b.time, status: 'Booked' as const, type: r.u.classType ?? 'private', minutes: availability.settings.lessonMinutes };
      db.lessons.push(l); r.u.credits -= 1;
      autoRemind(r.u, l.id);
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
    if (refunded) { r.u.credits += 1; dropQueuedAlerts(`auto-remind:${l.id}`); }
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
    if (lessonStart(l) - Date.now() < STUDIO.moveHours * 36e5) return problem(409, `上課前 ${STUDIO.moveHours} 小時內不能改時間，如果無法上課請取消預約。`, 'too_late_to_move');
    const b = (await request.json()) as { date: string; time: string; reason: string };
    const bad = validSlot(b.date, b.time); if (bad) return problem(400, bad);
    if (isTaken(b.date, b.time)) return problem(409, '這個時段已經有人了。', 'slot_taken');
    db.changes.push({ id: newId(), lessonId: l.id, toDate: b.date, toTime: b.time, reason: b.reason ?? '', status: 'Open' });
    return HttpResponse.json({ ok: true }, { status: 201 });
  }),
  http.post('/api/student/change-requests/:id/withdraw', async ({ params }) => {
    await lag();
    const r = requireUser('Student'); if (r.err) return r.err;
    const c = db.changes.find((x) => x.id === params.id && x.status === 'Open' && (x.by ?? 'student') === 'student');
    if (!c) return problem(404, '找不到申請。');
    c.status = 'Withdrawn';
    return new HttpResponse(null, { status: 204 });
  }),
  // the student answers Iris's proposal
  http.post('/api/student/change-requests/:id/:answer', async ({ params }) => {
    await delay(400);
    const r = requireUser('Student'); if (r.err) return r.err;
    if (params.answer !== 'accept' && params.answer !== 'decline') return undefined;
    const c = db.changes.find((x) => x.id === params.id && x.by === 'teacher');
    const l = c && db.lessons.find((x) => x.id === c.lessonId && x.studentId === r.u.id);
    if (!c || !l) return problem(404, '找不到老師的提議。');
    if (c.status !== 'Open') return problem(409, '這個提議已經處理過了。', 'already_handled');
    if (params.answer === 'accept') {
      if (slotPast(c.toDate, c.toTime) || isTaken(c.toDate, c.toTime, l.id)) return problem(409, '這個時段已經不能預約了，請和老師聯絡。', 'slot_taken');
      c.prev = { date: l.date, time: l.time }; l.date = c.toDate; l.time = c.toTime; c.status = 'Approved';
    } else c.status = 'Declined';
    c.decidedAt = Date.now();
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
      // buy any time — credits are added on top when Iris confirms. Still one receipt waiting at a time.
      if (db.payments.some((p) => p.studentId === r.u.id && p.status === 'Pending')) return problem(409, '已經有一張收據在等老師確認。', 'pending_exists');
      const form = await request.clone().formData();
      const size = Number(form.get('packageSize'));
      const pkg = STUDIO.packages.find((p) => p.size === size); if (!pkg) return problem(400, '請選擇方案。');
      if (pkg.trial && !trialAvailable(r.u)) return problem(409, '體驗課只限第一次上課的學生購買一次。', 'trial_not_available');
      const file = form.get('receipt'); if (!(file instanceof File) || file.size === 0) return problem(400, '請上傳收據圖片。');
      if (file.size > 5 * 1024 * 1024) return problem(400, '圖片不能超過 5 MB。');
      const p = { id: newId(), studentId: r.u.id, packageSize: size, amount: pkg.price, status: 'Pending' as const, uploadedAt: new Date().toISOString(), note: (form.get('note') as string) || null, rejectReason: null, receiptUrl: URL.createObjectURL(file), lqip: null, trial: !!pkg.trial };
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
        changes: db.changes.filter((c) => c.status === 'Open' && (c.by ?? 'student') === 'student').length,
        applications: db.users.filter((u) => u.status === 'Pending' && !u.declined).length,
        consults: db.consults.filter((c) => !c.contacted).length,
      },
      outOfQuota: db.users.filter((u) => u.role === 'Student' && u.status === 'Active' && u.credits === 0).map(summary),
    };
    return HttpResponse.json(o);
  }),
  // ---------- 可預約時段 (teacher) ----------
  http.get('/api/teacher/availability', async () => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    return HttpResponse.json(availability);
  }),
  http.put('/api/teacher/availability/settings', async ({ request }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const b = (await request.json()) as Availability['settings'];
    if (![30, 45, 60, 90, 120].includes(b.lessonMinutes) || ![0, 10, 15, 30, 60].includes(b.gapMinutes) || ![7, 14, 30, 60, 90].includes(b.advanceDays))
      return problem(400, '設定值不正確。', 'validation');
    availability.settings = { ...b };
    return HttpResponse.json(availability);
  }),
  http.put('/api/teacher/availability/weekly', async ({ request }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const b = (await request.json()) as Availability['weekly'];
    if (!Array.isArray(b) || b.length !== 7 || new Set(b.map((d) => d.weekday)).size !== 7) return problem(400, '資料格式不正確。', 'validation');
    for (const d of b) {
      const bad = d.enabled ? rangeProblems(d.ranges, availability.settings.lessonMinutes) : [];
      if (bad.length) return problem(400, bad[0], 'invalid_range');
    }
    availability.weekly = b.map((d) => ({ weekday: d.weekday, enabled: d.enabled, ranges: [...d.ranges].sort((x, y) => toMin(x.start) - toMin(y.start)) }));
    return HttpResponse.json(availability);
  }),
  http.put('/api/teacher/availability/overrides/:date', async ({ params, request }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const date = params.date as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < studioToday()) return problem(400, '請選擇今天以後的日期。', 'validation');
    const b = (await request.json()) as { closed: boolean; ranges: Availability['weekly'][number]['ranges']; note: string };
    if (!b.closed) {
      if (!b.ranges?.length) return problem(400, '請至少加一個時段，或改成全天休息。', 'validation');
      const bad = rangeProblems(b.ranges, availability.settings.lessonMinutes); if (bad.length) return problem(400, bad[0], 'invalid_range');
    }
    const o = { date, closed: !!b.closed, ranges: b.closed ? [] : [...b.ranges].sort((x, y) => toMin(x.start) - toMin(y.start)), note: (b.note ?? '').trim().slice(0, 60) };
    availability.overrides = [...availability.overrides.filter((x) => x.date !== date), o].sort((x, y) => x.date.localeCompare(y.date));
    return HttpResponse.json(availability);
  }),
  http.delete('/api/teacher/availability/overrides/:date', async ({ params }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    availability.overrides = availability.overrides.filter((x) => x.date !== params.date);
    return HttpResponse.json(availability);
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
      payments: db.payments.filter((p) => p.studentId === u.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).map(payDto),
      remindChannel: u.lineLinked ? 'line' : u.email ? 'email' : null,
      lastRemindedAt: db.alerts.filter((a) => a.userId === u.id && a.kind === 'reminder').map((a) => a.createdAt).sort().at(-1) ?? null,
    };
    return HttpResponse.json(d);
  }),
  // 通知學生繳學費: queued like every alert (10 s), so 復原 can pull it back before it leaves
  http.post('/api/teacher/students/:id/remind', async ({ params, request }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const u = userById(params.id as string); if (!u || u.role !== 'Student') return problem(404, '找不到學生。');
    const { message } = (await request.json()) as { message: string };
    const text = (message ?? '').trim();
    if (!text || text.length > 500) return problem(400, '訊息需要 1–500 個字。', 'validation');
    const channel = u.lineLinked ? 'line' : u.email ? 'email' : null;
    if (!channel) return problem(409, '這位學生沒有 LINE 或 Email，無法通知。', 'no_channel');
    const rid = newId();
    addAlert(u.id, 'reminder', '繳費提醒', text, `remind:${rid}`);
    return HttpResponse.json({ id: rid, channel });
  }),
  http.delete('/api/teacher/reminders/:rid', async ({ params }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    dropQueuedAlerts(`remind:${params.rid}`);
    return HttpResponse.json({ ok: true });
  }),
  http.post('/api/teacher/students/:id/credits', async ({ params, request }) => {
    await delay(300);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const u = userById(params.id as string); if (!u) return problem(404, '找不到學生。');
    const { delta } = (await request.json()) as { delta: number; reason?: string };
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 50) return problem(400, '調整數量不正確。', 'validation');
    if (u.credits + delta < 0) return problem(409, '堂數不能小於 0。', 'negative');
    u.credits += delta;
    addAlert(u.id, 'added', '老師調整了你的堂數', `現在剩餘 ${u.credits} 堂。`);
    return HttpResponse.json({ credits: u.credits });
  }),
  http.patch('/api/teacher/students/:id/class-type', async ({ params, request }) => {
    await delay(250);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const u = userById(params.id as string); if (!u || u.role !== 'Student') return problem(404, '找不到學生。');
    const { classType } = (await request.json()) as { classType: string };
    if (!['private', 'group', 'trial'].includes(classType)) return problem(400, '類型不正確。', 'validation');
    u.classType = classType as 'private' | 'group' | 'trial';
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/teacher/requests', async () => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    return HttpResponse.json({
      changes: db.changes.filter((c) => c.status === 'Open' && (c.by ?? 'student') === 'student').map((c) => {
        const l = db.lessons.find((x) => x.id === c.lessonId)!;
        return { id: c.id, lessonId: l.id, studentId: l.studentId, studentName: userById(l.studentId)!.name, fromDate: l.date, fromTime: l.time, toDate: c.toDate, toTime: c.toTime, reason: c.reason, slotFree: !isTaken(c.toDate, c.toTime, l.id) && !slotPast(c.toDate, c.toTime), createdAt: new Date().toISOString() };
      }),
      applications: db.users.filter((u) => u.status === 'Pending' && !u.declined).map((u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt })),
      proposals: db.changes.filter((c) => c.by === 'teacher' && (c.status === 'Open' || (c.status !== 'Withdrawn' && (c.decidedAt ?? 0) > Date.now() - 7 * 864e5)))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).map((c) => {
          const l = db.lessons.find((x) => x.id === c.lessonId)!;
          return { id: c.id, lessonId: l.id, studentId: l.studentId, studentName: userById(l.studentId)!.name, fromDate: c.prev?.date ?? l.date, fromTime: c.prev?.time ?? l.time,
            toDate: c.toDate, toTime: c.toTime, message: c.reason, status: c.status.toLowerCase(), createdAt: new Date(c.createdAt ?? Date.now()).toISOString(), decidedAt: c.decidedAt ? new Date(c.decidedAt).toISOString() : null };
        }),
    });
  }),
  // 老師提議改時間 — the lesson only moves when the student accepts (BookingService.ProposeMoveAsync)
  http.post('/api/teacher/lessons/:id/proposals', async ({ params, request }) => {
    await delay(500);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const l = db.lessons.find((x) => x.id === params.id && x.status === 'Booked'); if (!l) return problem(404, '找不到這堂課。');
    if (slotPast(l.date, l.time)) return problem(409, '已經開始的課不能改時間。');
    const b = (await request.json()) as { date: string; time: string; message?: string };
    if (slotPast(b.date, b.time)) return problem(400, '請選擇未來的時段。');
    if (b.date === l.date && b.time === l.time) return problem(400, '新時段和原本的一樣。');
    const open = db.changes.find((c) => c.lessonId === l.id && c.status === 'Open');
    if (open?.by === 'teacher') return problem(409, '已經提議過了，請等學生回覆，或先收回。', 'already_open');
    if (isTaken(b.date, b.time, l.id)) return problem(409, '這個時段已經有人了。', 'slot_taken');
    if (open) { open.status = 'Declined'; open.decidedAt = Date.now(); } // the proposal answers the student's request
    const c = { id: newId(), lessonId: l.id, toDate: b.date, toTime: b.time, reason: (b.message ?? '').trim(), status: 'Open' as const, by: 'teacher' as const, createdAt: Date.now() };
    db.changes.push(c);
    addAlert(l.studentId, 'proposal', '老師想調整上課時間', `${fmtSlot(l.date, l.time)} → ${fmtSlot(b.date, b.time)}。請到首頁回覆可以或不方便。${c.reason ? `\n老師：${c.reason}` : ''}`, `change:${c.id}`);
    return HttpResponse.json({ id: c.id }, { status: 201 });
  }),
  http.post('/api/teacher/proposals/:id/withdraw', async ({ params }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const c = db.changes.find((x) => x.id === params.id && x.by === 'teacher' && x.status === 'Open');
    if (!c) return problem(404, '找不到提議，可能學生已經回覆了。');
    c.status = 'Withdrawn'; c.decidedAt = Date.now(); dropQueuedAlerts(`change:${c.id}`);
    return new HttpResponse(null, { status: 204 });
  }),
  // Iris books for a student (uses one of the student's 堂數, the student gets an alert)
  http.post('/api/teacher/lessons', async ({ request }) => {
    const r = requireUser('Teacher'); if (r.err) return r.err;
    return idempotent(request, r.u.id, async () => {
      await delay(600);
      const s = userById(new URL(request.url).searchParams.get('studentId') ?? ''); if (!s) return problem(404, '找不到學生。');
      const b = (await request.clone().json()) as { date: string; time: string };
      const bad = validSlot(b.date, b.time); if (bad) return problem(400, bad, 'invalid_slot');
      if (s.credits <= 0) return problem(409, '堂數已用完，請先購買新方案。', 'no_credits');
      if (isTaken(b.date, b.time)) return problem(409, '這個時段剛被別人預約了。沒有扣堂數，請選其他時段。', 'slot_taken');
      const l = { id: newId(), studentId: s.id, date: b.date, time: b.time, status: 'Booked' as const, type: s.classType ?? 'private', minutes: availability.settings.lessonMinutes };
      db.lessons.push(l); s.credits -= 1;
      addAlert(s.id, 'added', '老師新增了一堂課', `${fmtSlot(b.date, b.time)} · A 教室`, `add:${l.id}`);
      autoRemind(s, l.id);
      return HttpResponse.json({ id: l.id }, { status: 201 });
    });
  }),
  http.post('/api/teacher/change-requests/:id/:action', async ({ params, request }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const c = db.changes.find((x) => x.id === params.id && (x.by ?? 'student') === 'student'); if (!c) return problem(404, '找不到申請。');
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
