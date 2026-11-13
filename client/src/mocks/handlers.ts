import type { MConsent, MPrivacyRequest, MReel } from './db';
import { delay, http, HttpResponse } from 'msw';
import { PW_RULES } from '../lib/password';
import { addDays, compareSlot, fmtSlot, studioToday } from '../lib/date';
import { rangeProblems, slotTimesFor, toMin } from '../lib/availability';
import type { Availability, Me, Overview, StudentDetail, StudentSummary } from '../lib/types';
import {
  ALERT_DELAY_MS, STUDIO, UNDO_MS, addAlert, availability, db, dropQueuedAlerts, settleAttendance, idem, isTaken, lessonDto, lessonStart,
  newId, reportUntil, slotPast, userById, validSlot, type MUser,
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
    voiceType: u.voiceType, goal: u.goal, grade: u.grade, avatarUrl: u.avatarUrl ?? null, credits: u.credits,
    booked: mine.filter((l) => l.status === 'Booked').length, attended: mine.filter((l) => l.status === 'Attended').length,
    cancelled: mine.filter((l) => l.status === 'Cancelled' && !l.refunded && !l.byTeacher && l.cancelReason !== 'reported').length,
    reported: mine.filter((l) => l.status === 'Cancelled' && l.cancelReason === 'reported').length,
    packageSize: u.packageSize,
    unreadAlerts: db.alerts.filter((a) => a.userId === u.id && !a.read && a.sendAfter <= Date.now()).length,
    classType: u.classType ?? 'private', trialAvailable: trialAvailable(u),
  };
}
/** 體驗 students can buy the trial package once (a rejected receipt doesn't count) */
// 單堂課: one purchase, only after Iris marks the consultation/interview as done
const trialAvailable = (u: MUser) => !!u.consultationCompleted && !db.payments.some((p) => p.studentId === u.id && p.trial && p.status !== 'Rejected');
/** 學生分類 for the 學生列表 filters (server: StudentSegments.Classify — same rules)
 *  活躍 active   = still has credits
 *  未上單堂課 noTrial = approved (Active) but never bought anything, not even the 單堂課
 *  未購買課程 lapsed  = credits used up, last lesson less than 3 months ago (a re-buy is likely)
 *  冷漠 cold    = no purchase AND no lesson for more than 3 months */
const MONTHS3 = 91 * 864e5;
function segment(u: MUser): StudentSummary['segment'] {
  if (u.status !== 'Active' || u.disabled) return null;
  if (u.credits > 0) return 'active';
  const paid = db.payments.filter((p) => p.studentId === u.id && p.status === 'Confirmed');
  if (!paid.length) return 'noTrial';
  const now = Date.now();
  const lessonTimes = db.lessons.filter((l) => l.studentId === u.id && l.status !== 'Cancelled').map((l) => Date.parse(`${l.date}T${l.time}:00+08:00`));
  const lastLesson = Math.max(0, ...lessonTimes.filter((t) => t <= now));
  const upcoming = lessonTimes.some((t) => t > now);
  const lastPaid = Math.max(...paid.map((p) => Date.parse(p.uploadedAt)));
  if (upcoming || now - lastLesson < MONTHS3) return 'lapsed';
  return now - lastPaid > MONTHS3 ? 'cold' : 'lapsed';
}
function summary(u: MUser): StudentSummary {
  const up = db.lessons.filter((l) => l.studentId === u.id && l.status === 'Booked' && !slotPast(l.date, l.time)).sort(compareSlot);
  return {
    id: u.id, name: u.name, status: u.status, classType: u.classType ?? 'private', consultationCompleted: !!u.consultationCompleted, credits: u.credits, booked: up.length,
    nextLesson: up[0] ? { date: up[0].date, time: up[0].time } : null,
    paymentPending: db.payments.some((p) => p.studentId === u.id && p.status === 'Pending'), lineId: u.lineId, voiceType: u.voiceType,
    studentNo: u.studentNo ?? 0, gender: u.gender ?? null, joinedAt: u.joinedAt ?? u.createdAt, avatarUrl: u.avatarUrl ?? null, disabled: !!u.disabled, segment: segment(u),
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
/* ---------- consent records (append-only) ---------- */
const latestConsent = (userId: string, kind: MConsent['kind']) => db.consents.filter((c) => c.userId === userId && c.kind === kind).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
const consentSummary = (userId: string) => {
  const m = latestConsent(userId, 'media'), k = latestConsent(userId, 'marketing');
  return { media: !!m?.granted, mediaAt: m?.at ?? null, mediaWithdrawn: !!m && !m.granted && db.consents.some((c) => c.userId === userId && c.kind === 'media' && c.granted),
    marketing: !!k?.granted, minor: !!latestConsent(userId, 'guardian')?.granted };
};
type ConsentBody = { version: string; terms: boolean; media: boolean; marketing: boolean; minor: boolean; guardian: { name: string; relation: string; contact: string; agreed: boolean } | null };
/** same checks as ConsentService.cs: terms required once, a minor needs a guardian who agreed */
function consentProblem(b: ConsentBody, first: boolean) {
  if (!b || typeof b.version !== 'string' || !b.version) return '缺少同意版本。';
  if (first && !b.terms) return '請閱讀並同意服務條款與隱私權政策。';
  if (first && b.minor && (!b.guardian?.agreed || !b.guardian.name?.trim() || !b.guardian.relation?.trim() || !b.guardian.contact?.trim())) return '未滿 18 歲需填寫法定代理人資料並由其同意。';
  return null;
}
/** later changes by a minor: switching an optional consent ON needs the guardian's confirmation (withdrawing never does) */
function minorChangeProblem(userId: string, b: ConsentBody) {
  if (!latestConsent(userId, 'guardian')?.granted) return null;
  const turnsOn = (b.media && !latestConsent(userId, 'media')?.granted) || (b.marketing && !latestConsent(userId, 'marketing')?.granted);
  return turnsOn && !b.guardian?.agreed ? '未滿 18 歲，開啟此同意需由法定代理人確認。' : null;
}
function recordConsents(userId: string, b: ConsentBody, source: MConsent['source']) {
  const at = new Date().toISOString();
  const add = (kind: MConsent['kind'], granted: boolean, scope = '') => db.consents.push({ id: newId(), userId, kind, granted, version: b.version, scope, source, at,
    guardian: b.minor && b.guardian ? { name: b.guardian.name.trim(), relation: b.guardian.relation.trim(), contact: b.guardian.contact.trim() } : undefined });
  if (b.terms && !latestConsent(userId, 'terms')) { add('terms', true); add('privacy', true); }
  if (b.minor) add('guardian', true);
  // only write a record when the choice changes (or on first sign-up), so the log stays meaningful
  if (!latestConsent(userId, 'media') ? source === 'register' : latestConsent(userId, 'media')!.granted !== b.media) add('media', b.media, 'photo,video,voice');
  if (!latestConsent(userId, 'marketing') ? source === 'register' : latestConsent(userId, 'marketing')!.granted !== b.marketing) add('marketing', b.marketing, 'line,email');
}
const myConsentsDto = (userId: string) => {
  const m = latestConsent(userId, 'media'), k = latestConsent(userId, 'marketing'), g = latestConsent(userId, 'guardian');
  return { media: { granted: !!m?.granted, at: m?.at ?? null }, marketing: { granted: !!k?.granted, at: k?.at ?? null }, minor: !!g?.granted, guardianName: g?.guardian?.name ?? null,
    history: db.consents.filter((c) => c.userId === userId).sort((a, b) => b.at.localeCompare(a.at)).map((c) => ({ kind: c.kind, granted: c.granted, version: c.version, at: c.at, source: c.source })) };
};
const PRIV_DAYS: Record<MPrivacyRequest['type'], number> = { access: 15, copy: 15, correct: 30, stop: 30, delete: 30, withdraw: 30 };
const privDto = (p: MPrivacyRequest) => ({ ...p, dueAt: new Date(Date.parse(p.createdAt) + PRIV_DAYS[p.type] * 864e5).toISOString() });

const teacherProfileDto = (u: MUser) => ({
  name: u.name, email: u.email, emailVerified: !!u.emailVerified, lineLinked: u.lineLinked, hasPassword: !!u.password,
  lineId: u.lineId, lineIdPublic: !!u.lineIdPublic, avatarUrl: u.avatarUrl ?? null,
  status: u.teacherStatus ?? 'normal', statusLabel: u.statusLabel ?? null, statusMessage: u.statusMessage ?? null,
});
const feeLesson = (lessonId: string) => db.lessons.find((l) => l.id === lessonId)!;
const PW_RULE_TEXT = '密碼至少 8 個字元，需包含大寫字母、小寫字母和數字。';
const liveToken = (token?: string) => db.resetTokens.find((t) => t.token === token && !t.used && t.expiresAt > Date.now());
/** demo only: a drawn "bank transfer screenshot" so receipts without an upload still show a picture */
function demoReceipt(amount: number, at: string, name: string) {
  const d = new Date(at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960"><rect width="540" height="960" fill="#F4F6F8"/><rect width="540" height="120" fill="#1F5FAD"/><text x="270" y="74" font-family="sans-serif" font-size="30" fill="#fff" text-anchor="middle" font-weight="700">轉帳成功</text><circle cx="270" cy="230" r="54" fill="#2E9D5B"/><path d="M243 231l19 19 36-38" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="270" y="352" font-family="sans-serif" font-size="56" fill="#1B2430" text-anchor="middle" font-weight="700">NT$ ${amount.toLocaleString('en-US')}</text><rect x="40" y="410" width="460" height="330" rx="18" fill="#fff"/><g font-family="sans-serif" font-size="24" fill="#5B6573"><text x="70" y="470">轉出帳號</text><text x="70" y="540">轉入帳號</text><text x="70" y="610">交易時間</text><text x="70" y="680">備註</text></g><g font-family="sans-serif" font-size="24" fill="#1B2430" text-anchor="end"><text x="470" y="470">***-***-12345</text><text x="470" y="540">Iris Studio</text><text x="470" y="610">${d}</text><text x="470" y="680">${name} 學費</text></g><text x="270" y="820" font-family="sans-serif" font-size="20" fill="#9AA3AE" text-anchor="middle">示範用收據圖片</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
const payDto = ({ feeIds, decidedAt: _d, ...p }: (typeof db.payments)[number]) => ({
  ...p, receiptUrl: p.receiptUrl || demoReceipt(p.amount, p.uploadedAt, userById(p.studentId)?.name ?? ''),
  studentName: userById(p.studentId)?.name ?? '', studentAvatarUrl: userById(p.studentId)?.avatarUrl ?? null,
  // fees billed on this receipt (a rejected receipt lets them go, so they're no longer listed)
  fees: db.fees.filter((f) => f.paymentId === p.id && (feeIds ?? []).includes(f.id))
    .map((f) => ({ id: f.id, amount: f.amount, date: feeLesson(f.lessonId).date, time: feeLesson(f.lessonId).time })),
});
const feeDto = (f: (typeof db.fees)[number]) => ({ id: f.id, lessonId: f.lessonId, date: feeLesson(f.lessonId).date, time: feeLesson(f.lessonId).time, amount: f.amount, status: f.status.toLowerCase(), paymentId: f.paymentId });
/** attach every Unpaid 取消費 to a receipt (the "next payment") */
function billFees(studentId: string, paymentId: string) {
  const fs = db.fees.filter((f) => f.studentId === studentId && f.status === 'Unpaid');
  fs.forEach((f) => { f.status = 'Billed'; f.paymentId = paymentId; });
  return fs;
}

export const handlers = [
  // Test hook: sessionStorage['iris-mock-fail'] = 'regex' makes matching requests fail with 500 (simulates a server error).
  http.all('/api/*', ({ request }) => {
    const re = store.getItem('iris-mock-fail');
    if (re && new RegExp(re).test(new URL(request.url).pathname)) return problem(500, '伺服器暫時無法處理，請稍後再試。', 'server_error');
    return undefined;
  }),
  // ---------- public ----------
  http.get('/api/public/studio', () => {
    const t = db.users.find((u) => u.role === 'Teacher')!;
    const teacher = { name: t.name, avatarUrl: t.avatarUrl ?? null, status: t.teacherStatus ?? 'normal', statusLabel: t.statusLabel ?? null, statusMessage: t.statusMessage ?? null, lineId: t.lineIdPublic ? t.lineId : null };
    return HttpResponse.json({ ...STUDIO, lessonMinutes: availability.settings.lessonMinutes, teacher });
  }),
  // ---- 教師個人資料 (same rules as TeacherProfileEndpoints.cs) ----
  http.get('/api/teacher/profile', async () => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    return HttpResponse.json(teacherProfileDto(r.u));
  }),
  http.put('/api/teacher/profile', async ({ request }) => {
    await delay(500);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const b = (await request.json()) as { name: string; lineId: string | null; lineIdPublic: boolean; status: string; statusLabel: string | null; statusMessage: string | null };
    const name = (b.name ?? '').trim(), label = (b.statusLabel ?? '').trim(), msg = (b.statusMessage ?? '').trim(), line = (b.lineId ?? '').trim();
    if (!name || name.length > 40) return problem(400, '請填寫教師名稱（最多 40 字）。', 'validation');
    if (!['normal', 'vacation', 'noNewStudents', 'custom'].includes(b.status)) return problem(400, '請選擇目前狀態。', 'validation');
    if (b.status === 'custom' && (!label || label.length > 12)) return problem(400, '自訂狀態請填 1–12 個字。', 'validation');
    if (msg.length > 60) return problem(400, '狀態訊息最多 60 字。', 'validation');
    if (line.length > 30) return problem(400, 'LINE ID 最多 30 字。', 'validation');
    Object.assign(r.u, { name, lineId: line || null, lineIdPublic: b.lineIdPublic && !!line, teacherStatus: b.status, statusLabel: b.status === 'custom' ? label : null, statusMessage: msg || null });
    return HttpResponse.json(teacherProfileDto(r.u));
  }),
  http.post('/api/teacher/profile/avatar', async ({ request }) => {
    await delay(600);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const f = (await request.formData()).get('avatar');
    if (!(f instanceof File) || f.size === 0) return problem(400, '請選擇照片。', 'validation');
    if (f.size > 2 * 1024 * 1024) return problem(400, '照片不能超過 2 MB。', 'too_large');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return problem(400, '只接受 JPG、PNG 或 WEBP 圖片。', 'bad_image');
    r.u.avatarUrl = URL.createObjectURL(f);
    return HttpResponse.json({ avatarUrl: r.u.avatarUrl });
  }),
  http.delete('/api/teacher/profile/avatar', async () => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    r.u.avatarUrl = null;
    return new HttpResponse(null, { status: 204 });
  }),
  http.put('/api/teacher/account/email', async ({ request }) => {
    await delay(500);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const b = (await request.json()) as { email: string; password: string };
    const email = (b.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return problem(400, '請填寫正確的 Email。', 'validation');
    if (!r.u.password || b.password !== r.u.password) return problem(403, '密碼不正確。', 'wrong_password');
    if (db.users.some((u) => u.email === email && u.id !== r.u.id)) return problem(409, '這個 Email 已經被其他帳號使用。', 'email_taken');
    if (r.u.email !== email) { r.u.email = email; r.u.emailVerified = false; }
    return HttpResponse.json(teacherProfileDto(r.u));
  }),
  http.delete('/api/teacher/account/line', async () => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    if (!r.u.password || !r.u.email) return problem(409, '這是你唯一的登入方式，請先設定 Email 和密碼。', 'last_login_method');
    r.u.lineLinked = false;
    return new HttpResponse(null, { status: 204 });
  }),
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
    const b = (await request.json()) as { name: string; email: string; phone: string | null; password: string; consents: ConsentBody };
    const cp = consentProblem(b.consents, true); if (cp) return problem(400, cp, 'consent_required');
    const email = b.email?.trim().toLowerCase();
    if (!b.name?.trim() || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return problem(400, '請填寫姓名和正確的 Email。', 'validation');
    if (!PW_RULES.every((r) => r.test(b.password ?? ''))) return problem(400, PW_RULE_TEXT, 'validation');
    if (db.users.some((u) => u.email === email)) return problem(409, '這個 Email 已經註冊過了，請直接登入。', 'email_taken');
    const u: MUser = { id: newId(), name: b.name.trim(), role: 'Student', status: 'Pending', email, password: b.password, phone: b.phone, lineId: null, lineLinked: false,
      voiceType: null, goal: null, grade: null, credits: 0, packageSize: 0, createdAt: new Date().toISOString(), classType: 'trial' };
    db.users.push(u);
    recordConsents(u.id, b.consents, 'register');
    store.setItem(SESSION, u.id);
    return HttpResponse.json(meDto(u), { status: 201 });
  }),
  // consents: LINE sign-up sends them right after the redirect; 同意設定 sends changes. Always a new record.
  http.get('/api/me/consents', async () => {
    await lag();
    const r = requireUser('Student'); if (r.err) return r.err;
    return HttpResponse.json(myConsentsDto(r.u.id));
  }),
  http.post('/api/me/consents', async ({ request }) => {
    await lag();
    const id = store.getItem(SESSION); const u = id ? userById(id) : undefined;
    if (!u || u.role !== 'Student') return problem(401, '請先登入。');
    const b = (await request.json()) as ConsentBody;
    const first = !latestConsent(u.id, 'terms');
    const cp = consentProblem(b, first) ?? (first ? null : minorChangeProblem(u.id, b)); if (cp) return problem(400, cp, 'consent_required');
    recordConsents(u.id, { ...b, minor: first ? b.minor : false }, first ? 'register' : 'profile');
    return HttpResponse.json(myConsentsDto(u.id));
  }),
  // 個人資料權利申請 — public (works without an account), rate-limited on the server
  http.post('/api/public/privacy-requests', async ({ request }) => {
    await delay(500);
    const b = (await request.json()) as { name: string; contact: string; type: MPrivacyRequest['type']; detail: string };
    if (!b.name?.trim() || !b.contact?.trim()) return problem(400, '請填寫姓名和聯絡方式。', 'validation');
    if (!(b.type in PRIV_DAYS)) return problem(400, '請選擇申請項目。', 'validation');
    if ((b.detail ?? '').length > 1000) return problem(400, '說明最多 1000 字。', 'validation');
    const p: MPrivacyRequest = { id: newId(), name: b.name.trim().slice(0, 80), contact: b.contact.trim().slice(0, 120), type: b.type, detail: (b.detail ?? '').trim(), status: 'open', createdAt: new Date().toISOString(), handledAt: null, note: null };
    db.privacyRequests.push(p);
    return HttpResponse.json({ id: p.id, dueAt: privDto(p).dueAt }, { status: 201 });
  }),
  http.get('/api/teacher/privacy-requests', async () => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    return HttpResponse.json([...db.privacyRequests].sort((a, b) => (a.status === b.status ? a.createdAt.localeCompare(b.createdAt) : a.status === 'open' ? -1 : 1)).map(privDto));
  }),
  http.post('/api/teacher/privacy-requests/:id/done', async ({ params, request }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const p = db.privacyRequests.find((x) => x.id === params.id); if (!p) return problem(404, '找不到申請。');
    const b = (await request.json()) as { note: string };
    if (!b.note?.trim()) return problem(400, '請簡單記錄處理結果。', 'validation');
    Object.assign(p, { status: 'done', handledAt: new Date().toISOString(), note: b.note.trim().slice(0, 500) });
    return HttpResponse.json(privDto(p));
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
  // 忘記密碼 (same rules as PasswordService.cs). Always "ok", so nobody learns which emails are registered.
  // The mock can't send email, so it returns the link as demoLink — the real server never does.
  http.post('/api/auth/forgot-password', async ({ request }) => {
    await delay(600);
    const { email } = (await request.json()) as { email?: string };
    const u = db.users.find((x) => x.email === (email ?? '').trim().toLowerCase() && x.password && !x.declined);
    if (!u) return HttpResponse.json({ ok: true });
    db.resetTokens.forEach((t) => { if (t.userId === u.id) t.used = true; }); // asking again cancels older links
    const t = { token: newId().replace(/-/g, ''), userId: u.id, expiresAt: Date.now() + 30 * 60_000, used: false, createdAt: Date.now() };
    db.resetTokens.push(t);
    return HttpResponse.json({ ok: true, demoLink: `/reset-password?token=${t.token}` });
  }),
  http.post('/api/auth/reset-password/check', async ({ request }) => {
    await delay(250);
    const { token } = (await request.json()) as { token?: string };
    return HttpResponse.json({ valid: !!liveToken(token) });
  }),
  http.post('/api/auth/reset-password', async ({ request }) => {
    await delay(700);
    const b = (await request.json()) as { token?: string; password?: string };
    const t = liveToken(b.token);
    if (!t) return problem(410, '這個連結已失效或已使用過，請重新申請重設密碼。', 'link_invalid');
    const pw = b.password ?? '';
    if (!PW_RULES.every((r) => r.test(pw))) return problem(400, PW_RULE_TEXT, 'validation');
    const u = userById(t.userId)!;
    const recent = (u.passwordHistory ?? [u.password ?? '']).slice(0, 3);
    if (recent.includes(pw)) return problem(409, '新密碼不能和最近 3 次用過的密碼相同。', 'password_reused');
    u.password = pw; u.passwordHistory = [pw, ...recent].slice(0, 3); t.used = true;
    return new HttpResponse(null, { status: 204 });
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
  // 回報: ask Iris to cancel a lesson that already passed (ReportService.ReportAsync)
  http.post('/api/student/lessons/:id/reports', async ({ params, request }) => {
    const r = requireUser('Student'); if (r.err) return r.err;
    return idempotent(request, r.u.id, async () => {
      await delay(500);
      const l = db.lessons.find((x) => x.id === params.id && x.studentId === r.u.id);
      if (!l) return problem(404, '找不到這堂課。');
      if (l.status !== 'Attended') return problem(409, '只有已上課的課可以回報。', 'not_attended');
      if (db.reports.some((x) => x.lessonId === l.id && x.status !== 'Withdrawn')) return problem(409, '這堂課已經回報過了。', 'already_reported');
      if (!reportUntil(l)) return problem(409, `只能回報 ${STUDIO.reportDays} 天內上過的課。`, 'report_window_closed');
      const b = (await request.clone().json().catch(() => ({}))) as { reason?: string | null };
      const reason = b.reason?.trim() ? b.reason.trim().slice(0, 200) : null;
      const rp = { id: newId(), lessonId: l.id, studentId: r.u.id, reason, status: 'Open' as const, message: null, createdAt: new Date().toISOString() };
      db.reports.push(rp);
      return HttpResponse.json(lessonDto(l), { status: 201 });
    });
  }),
  http.post('/api/student/reports/:id/withdraw', async ({ params }) => {
    await lag();
    const r = requireUser('Student'); if (r.err) return r.err;
    const rp = db.reports.find((x) => x.id === params.id && x.studentId === r.u.id);
    if (!rp) return problem(404, '找不到回報。');
    if (rp.status !== 'Open') return problem(409, '老師已經處理過這個回報了。', 'already_handled');
    rp.status = 'Withdrawn';
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/student/fees', async () => {
    await lag();
    const r = requireUser('Student'); if (r.err) return r.err;
    return HttpResponse.json(db.fees.filter((f) => f.studentId === r.u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(feeDto));
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
      if (pkg.trial && !trialAvailable(r.u)) return problem(409, '單堂課只限第一次上課的學生購買一次。', 'trial_not_available');
      const file = form.get('receipt'); if (!(file instanceof File) || file.size === 0) return problem(400, '請上傳收據圖片。');
      if (file.size > 5 * 1024 * 1024) return problem(400, '圖片不能超過 5 MB。');
      const p = { id: newId(), studentId: r.u.id, packageSize: size, amount: pkg.price, status: 'Pending' as const, uploadedAt: new Date().toISOString(), note: (form.get('note') as string) || null, rejectReason: null, receiptUrl: URL.createObjectURL(file), lqip: null, trial: !!pkg.trial };
      db.payments.push(p);
      // 取消費 go on the next payment: every Unpaid fee is added to this receipt's expected amount
      const fs = billFees(r.u.id, p.id);
      p.amount += fs.reduce((n, f) => n + f.amount, 0);
      (p as typeof p & { feeIds?: string[] }).feeIds = fs.map((f) => f.id);
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
        reports: db.reports.filter((x) => x.status === 'Open').length,
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
  // 停用 / 啟用: a disabled student keeps all history but can't book (server: PATCH /api/teacher/students/{id}/status)
  http.patch('/api/teacher/students/:id/status', async ({ params, request }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const u = userById(params.id as string); if (!u || u.role !== 'Student') return problem(404, '找不到學生。');
    const b = await request.json() as { disabled: boolean };
    u.disabled = !!b.disabled;
    return HttpResponse.json(summary(u));
  }),
  // 給筆記 / 給作業 (server: POST /api/teacher/students/{id}/notes)
  http.post('/api/teacher/students/:id/notes', async ({ params, request }) => {
    await lag();
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const u = userById(params.id as string); if (!u || u.role !== 'Student') return problem(404, '找不到學生。');
    const b = await request.json() as { kind: 'note' | 'homework'; text: string };
    const text = (b.text ?? '').trim();
    if (!text) return problem(400, '請輸入內容。');
    if (text.length > 1000) return problem(400, '內容最多 1000 字。');
    const n = { id: crypto.randomUUID(), studentId: u.id, kind: b.kind === 'homework' ? 'homework' as const : 'note' as const, text, createdAt: new Date().toISOString() };
    db.notes.push(n);
    if (n.kind === 'homework') addAlert(u.id, 'homework', '老師給你新的作業', text.slice(0, 80), `homework:${n.id}`);
    return HttpResponse.json(n, { status: 201 });
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
      past: mine.filter((l) => l.status === 'Attended' || l.cancelReason === 'reported').reverse().map(lessonDto),
      payments: db.payments.filter((p) => p.studentId === u.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).map(payDto),
      remindChannel: u.lineLinked ? 'line' : u.email ? 'email' : null,
      lastRemindedAt: db.alerts.filter((a) => a.userId === u.id && a.kind === 'reminder').map((a) => a.createdAt).sort().at(-1) ?? null,
      consent: consentSummary(u.id),
      // demo data only has recent lessons/payments, so the student's start date (joinedAt) counts as the first lesson/purchase too
      firstLessonDate: [...mine.filter((l) => l.status !== 'Cancelled').map((l) => l.date), ...(u.joinedAt && mine.length ? [studioToday(new Date(u.joinedAt))] : [])].sort()[0] ?? null,
      firstPurchaseAt: [...db.payments.filter((p) => p.studentId === u.id && p.status === 'Confirmed').map((p) => p.uploadedAt), ...(u.joinedAt && mine.length ? [new Date(Date.parse(u.joinedAt) - 2 * 864e5).toISOString()] : [])].sort()[0] ?? null,
      totalPaid: db.payments.filter((p) => p.studentId === u.id && p.status === 'Confirmed').reduce((a, p) => a + p.amount, 0),
      loginMethod: u.lineLinked ? 'line' : 'email',
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
  http.patch('/api/teacher/students/:id/consultation', async ({ params, request }) => {
    await delay(250);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const u = userById(params.id as string); if (!u || u.role !== 'Student') return problem(404, '找不到學生。');
    const { consultationCompleted } = (await request.json()) as { consultationCompleted: boolean };
    u.consultationCompleted = !!consultationCompleted;
    return new HttpResponse(null, { status: 204 });
  }),
  /* ---------- 精彩片段 (IG Reels) — same rules as the server's ReelEndpoints ---------- */
  http.get('/api/public/reels', async () => { await lag(); return HttpResponse.json(liveReels().slice(0, 8).map(reelDto)); }),
  http.get('/api/teacher/reels', async () => { await lag(); const r = requireUser('Teacher'); if (r.err) return r.err; return HttpResponse.json(liveReels().map(reelDto)); }),
  http.post('/api/teacher/reels', async ({ request }) => {
    await delay(900);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    if (liveReels().length >= 8) return problem(409, '最多 8 則 Reels，請先刪除一則。', 'limit');
    const fd = await request.formData(); const bad = reelProblem(fd); if (bad) return bad;
    const reel: MReel = { id: `rl${Date.now()}`, sortOrder: liveReels().length + 1, title: String(fd.get('title')).trim(), url: String(fd.get('url')).trim(), coverUrl: null, deletedAt: null };
    const c = coverOf(fd); if (c instanceof Response) return c; if (c) reel.coverUrl = c;
    db.reels.push(reel);
    return HttpResponse.json(reelDto(reel));
  }),
  http.put('/api/teacher/reels/order', async ({ request }) => {
    await delay(250);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const { ids } = (await request.json()) as { ids: string[] };
    const live = liveReels();
    if (ids.length !== live.length || new Set(ids).size !== ids.length || live.some((x) => !ids.includes(x.id))) return problem(409, '列表已經變動，請重新整理後再排序。', 'stale');
    ids.forEach((id, i) => { db.reels.find((x) => x.id === id)!.sortOrder = i + 1; });
    return HttpResponse.json(liveReels().map(reelDto));
  }),
  http.put('/api/teacher/reels/:id', async ({ params, request }) => {
    await delay(900);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const reel = liveReels().find((x) => x.id === params.id); if (!reel) return problem(404, '找不到這則 Reels。');
    const fd = await request.formData(); const bad = reelProblem(fd); if (bad) return bad;
    const c = coverOf(fd); if (c instanceof Response) return c;
    reel.title = String(fd.get('title')).trim(); reel.url = String(fd.get('url')).trim(); if (c) reel.coverUrl = c;
    return HttpResponse.json(reelDto(reel));
  }),
  http.delete('/api/teacher/reels/:id', async ({ params }) => {
    await delay(300);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const reel = liveReels().find((x) => x.id === params.id);
    if (reel) { reel.deletedAt = Date.now(); liveReels().forEach((x, i) => { x.sortOrder = i + 1; }); } // soft delete + renumber
    return new HttpResponse(null, { status: 204 });
  }),
  http.put('/api/teacher/packages', async ({ request }) => {
    await delay(300);
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const { packages } = (await request.json()) as { packages: { size: number; price: number; trial?: boolean }[] };
    // same rules as the server's PackageService
    const bad = (m: string) => problem(400, m, 'validation');
    if (!packages?.length) return bad('至少要有一個方案。');
    if (packages.length > 8) return bad('最多 8 個方案。');
    if (packages.filter((p) => p.trial).length > 1) return bad('單堂課只能有一個。');
    if (packages.some((p) => p.trial && p.size !== 1)) return bad('單堂課固定是 1 堂。');
    if (!packages.some((p) => !p.trial)) return bad('至少要有一個一般方案（例如 4 堂）。');
    if (packages.some((p) => !Number.isInteger(p.size) || p.size < 1 || p.size > 100)) return bad('堂數要在 1–100 之間。');
    if (packages.some((p) => !Number.isInteger(p.price) || p.price < 1 || p.price > 500000)) return bad('價格要在 NT$1–500,000 之間。');
    if (new Set(packages.map((p) => p.size)).size !== packages.length) return bad('每個方案的堂數不能重複。');
    STUDIO.packages = [...packages].sort((a, b) => Number(!!b.trial) - Number(!!a.trial) || a.size - b.size).map((p) => ({ size: p.size, price: p.price, ...(p.trial ? { trial: true } : {}) }));
    return HttpResponse.json(STUDIO.packages);
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
      reports: db.reports.filter((x) => x.status === 'Open').sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((x) => {
        const l = db.lessons.find((y) => y.id === x.lessonId)!;
        return { id: x.id, lessonId: l.id, studentId: l.studentId, studentName: userById(l.studentId)!.name, date: l.date, time: l.time, minutes: l.minutes ?? 60, reason: x.reason, createdAt: x.createdAt };
      }),
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
  // 回報 審核: approve = lesson cancelled, +1 堂, 取消費 on the next payment (unless waived); decline needs a reason
  http.post('/api/teacher/reports/:id/:action', async ({ params, request }) => {
    const r = requireUser('Teacher'); if (r.err) return r.err;
    const run = async () => {
      await lag();
      const rp = db.reports.find((x) => x.id === params.id); if (!rp) return problem(404, '找不到回報。');
      const l = db.lessons.find((x) => x.id === rp.lessonId)!; const s = userById(rp.studentId)!;
      if (params.action === 'undo') {
        if (!rp.decidedAt || Date.now() - rp.decidedAt > UNDO_MS) return problem(409, '已超過可以復原的時間。', 'undo_expired');
        if (rp.status === 'Approved') {
          const fee = db.fees.find((f) => f.reportId === rp.id);
          if (fee && fee.status !== 'Unpaid') return problem(409, '取消費已經加到收據上，無法復原。', 'fee_billed');
          if (s.credits < 1) return problem(409, '學生已經用掉退回的堂數，無法復原。', 'credits_used');
          s.credits -= 1; l.status = 'Attended'; l.cancelReason = undefined;
          if (fee) db.fees = db.fees.filter((f) => f !== fee);
        }
        rp.status = 'Open'; rp.message = null; rp.waived = undefined; rp.decidedAt = undefined; dropQueuedAlerts(`report:${rp.id}`);
        return new HttpResponse(null, { status: 204 });
      }
      if (params.action !== 'approve' && params.action !== 'decline') return problem(404, '找不到。');
      if (rp.status !== 'Open') return problem(409, '這個回報已經處理過了。', 'already_handled');
      const b = (await request.clone().json().catch(() => ({}))) as { message?: string | null; waiveFee?: boolean };
      if (params.action === 'approve') {
        if (l.status !== 'Attended') return problem(409, '這堂課的狀態已經改變了。', 'not_attended');
        l.status = 'Cancelled'; l.cancelReason = 'reported'; s.credits += 1; rp.status = 'Approved'; rp.waived = !!b.waiveFee;
        if (!b.waiveFee) db.fees.push({ id: newId(), studentId: s.id, lessonId: l.id, reportId: rp.id, amount: STUDIO.cancelFee, status: 'Unpaid', paymentId: null, createdAt: new Date().toISOString() });
        addAlert(s.id, 'report', '老師同意取消這堂課', b.waiveFee
          ? `${fmtSlot(l.date, l.time)} 的課已取消，退回 1 堂，這次不收取消費。`
          : `${fmtSlot(l.date, l.time)} 的課已取消，退回 1 堂。取消費 NT$ ${STUDIO.cancelFee} 會加在下次繳費。`, `report:${rp.id}`);
      } else {
        if (!b.message?.trim()) return problem(400, '請填寫婉拒原因。', 'validation');
        rp.status = 'Declined'; rp.message = b.message.trim();
        addAlert(s.id, 'report', '老師無法取消這堂課', `${fmtSlot(l.date, l.time)}：${rp.message}`, `report:${rp.id}`);
      }
      rp.decidedAt = Date.now();
      return new HttpResponse(null, { status: 204 });
    };
    return params.action === 'undo' ? run() : idempotent(request, r.u.id, run);
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
        // fees follow the receipt back to "waiting": Paid → Billed, or re-attached after a reject (if not billed elsewhere meanwhile)
        db.fees.filter((f) => (p.feeIds ?? []).includes(f.id)).forEach((f) => {
          if (f.status === 'Paid' || (f.status === 'Unpaid' && p.status === 'Rejected')) { f.status = 'Billed'; f.paymentId = p.id; }
        });
        p.status = 'Pending'; p.rejectReason = null; p.decidedAt = undefined; dropQueuedAlerts(`pay:${p.id}`);
        return new HttpResponse(null, { status: 204 });
      }
      if (p.status !== 'Pending') return problem(409, '這張收據已經處理過了。', 'already_handled');
      const { reason } = (await request.clone().json().catch(() => ({}))) as { reason?: string | null };
      if (params.action === 'confirm') {
        p.status = 'Confirmed'; s.credits += p.packageSize; s.packageSize = p.packageSize;
        db.fees.filter((f) => f.paymentId === p.id).forEach((f) => (f.status = 'Paid'));
        addAlert(s.id, 'payment', '付款已確認', `${p.packageSize} 堂已加入，現在剩餘 ${s.credits} 堂。`, `pay:${p.id}`);
      } else {
        if (!reason?.trim()) return problem(400, '請填寫退回原因。', 'validation');
        p.status = 'Rejected'; p.rejectReason = reason;
        // the fees weren't paid: back to Unpaid, they go on the next receipt
        db.fees.filter((f) => f.paymentId === p.id).forEach((f) => { f.status = 'Unpaid'; f.paymentId = null; });
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

/* ---------- reels helpers ---------- */
const liveReels = () => db.reels.filter((x) => x.deletedAt === null).sort((a, b) => a.sortOrder - b.sortOrder);
const reelDto = (x: MReel) => ({ id: x.id, sortOrder: x.sortOrder, title: x.title, url: x.url, coverUrl: x.coverUrl });
export const IG_REEL_RE = /^https:\/\/(www\.)?instagram\.com\/(reel|reels|p)\/[A-Za-z0-9_-]+\/?(\?[\x21-\x7E]*)?$/;
export const CJK_RE = /[\u3000-\u303F\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
function reelProblem(fd: FormData) {
  const title = String(fd.get('title') ?? '').trim(), url = String(fd.get('url') ?? '').trim();
  if (!title) return problem(400, '請填寫 IG 自訂標題。', 'validation');
  if (title.length > 60) return problem(400, '標題最多 60 個字。', 'validation');
  if (!url) return problem(400, '請填寫 Reels 連結。', 'validation');
  if (CJK_RE.test(url)) return problem(400, '連結不能有中文字。', 'validation');
  if (!url.startsWith('https://')) return problem(400, '連結要用 https:// 開頭。', 'validation');
  if (!IG_REEL_RE.test(url)) return problem(400, '請貼上 Instagram Reels 的連結，例如 https://www.instagram.com/reel/ABC123/', 'validation');
  return null;
}
function coverOf(fd: FormData): string | null | Response {
  const f = fd.get('cover');
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > 5 * 1024 * 1024) return problem(400, '封面圖不能超過 5 MB。', 'too_large');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return problem(400, '只接受 JPG、PNG 或 WEBP 圖片。', 'bad_image');
  return URL.createObjectURL(f);
}
