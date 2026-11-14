// In-memory stand-in for the .NET API, used by `npm run dev:mock` and the e2e tests.
// It follows the same business rules as server/IrisStudio.Api/Services/BookingService.cs,
// so the UI can be built and tested before the backend runs.
import { addDays, studioNowTime, studioToday, weekday } from '../lib/date';
import { overlaps, rangesFor, slotTimesFor } from '../lib/availability';
import type { AlertItem, AlertKind, Availability, Lesson, LessonNote, Payment, StudioInfo } from '../lib/types';

/** Iris's availability (可預約時段). Default: Mon–Sat 09:30–12:30 + 14:00–20:30, Sunday off. */
const weekdayRanges = [{ start: '09:30', end: '12:30' }, { start: '14:00', end: '20:30' }];
export const availability: Availability = {
  settings: { lessonMinutes: 60, gapMinutes: 30, advanceDays: 30 },
  weekly: [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, enabled: w !== 0, ranges: w === 0 ? [] : weekdayRanges.map((r) => ({ ...r })) })),
  overrides: [],
};

export const STUDIO: Omit<StudioInfo, 'lessonMinutes' | 'teacher'> = {
  cancelHours: 24,
  moveHours: 12,
  reportDays: 7,
  cancelFee: 500,
  packages: [{ size: 1, price: 1500, trial: true }, { size: 4, price: 3200 }, { size: 8, price: 6200 }],
  // Real bank details come from a local, git-ignored env file (.env.proto.local), never from the public repo.
  bank: {
    name: import.meta.env.VITE_BANK_NAME || '[銀行名稱]',
    account: import.meta.env.VITE_BANK_ACCOUNT || '[帳號]',
    holder: import.meta.env.VITE_BANK_HOLDER || '[戶名]',
  },
};

export interface MUser {
  id: string; name: string; role: 'Student' | 'Teacher'; status: 'Pending' | 'Active';
  email: string | null; password?: string; phone: string | null; lineId: string | null; lineLinked: boolean;
  voiceType: string | null; goal: string | null; grade: string | null;
  credits: number; packageSize: number; createdAt: string; declined?: boolean; classType?: 'private' | 'group' | 'trial'; consultationCompleted?: boolean;
  // teacher profile (教師個人資料)
  avatarUrl?: string | null; coverUrl?: string | null; emailVerified?: boolean; lineIdPublic?: boolean;
  teacherStatus?: 'normal' | 'vacation' | 'noNewStudents' | 'custom'; statusLabel?: string | null; statusMessage?: string | null;
  /** last 3 passwords (current first) — a new one may not repeat them */
  passwordHistory?: string[];
  // 學生列表 columns
  studentNo?: number; gender?: 'M' | 'F' | null; joinedAt?: string; disabled?: boolean;
  skills?: string[]; growthLevel?: number;
}
/** 忘記密碼 link (the server stores only a hash of the token; the mock keeps it plain) */
export interface MResetToken { token: string; userId: string; expiresAt: number; used: boolean; createdAt: number }
export interface MChange { id: string; lessonId: string; toDate: string; toTime: string; reason: string; status: 'Open' | 'Approved' | 'Declined' | 'Withdrawn'; decidedAt?: number; prev?: { date: string; time: string }; by?: 'student' | 'teacher'; createdAt?: number }
export interface MLesson { id: string; studentId: string; date: string; time: string; status: 'Booked' | 'Attended' | 'Cancelled'; type?: 'private' | 'group' | 'trial'; minutes?: number; cancelledAt?: number; refunded?: boolean; byTeacher?: boolean; cancelReason?: 'reported' }
/** 回報 of a past lesson (same rules as server/Services/ReportService.cs) */
export interface MReport { id: string; lessonId: string; studentId: string; reason: string | null; status: 'Open' | 'Approved' | 'Declined' | 'Withdrawn'; message: string | null; createdAt: string; decidedAt?: number; waived?: boolean }
export interface MNote { id: string; studentId: string; kind: 'note' | 'homework'; text: string; createdAt: string }
export interface MReel { id: string; sortOrder: number; title: string; url: string; coverUrl: string | null; deletedAt: number | null }
export interface MFee { id: string; studentId: string; lessonId: string; reportId: string; amount: number; status: 'Unpaid' | 'Billed' | 'Paid'; paymentId: string | null; createdAt: string }
export interface MAlert extends AlertItem { userId: string; sendAfter: number; source?: string }
export interface MPayment extends Omit<Payment, 'studentName' | 'fees'> { decidedAt?: number; feeIds?: string[] }
export interface MConsent { id: string; userId: string; kind: 'terms' | 'privacy' | 'media' | 'marketing' | 'guardian'; granted: boolean; version: string; scope: string; source: 'register' | 'profile' | 'request'; at: string; guardian?: { name: string; relation: string; contact: string } }
export interface MPrivacyRequest { id: string; name: string; contact: string; type: 'access' | 'copy' | 'correct' | 'stop' | 'delete' | 'withdraw'; detail: string; status: 'open' | 'done'; createdAt: string; handledAt: string | null; note: string | null }
export interface MConsult { id: string; name: string; contactType: 'line' | 'email'; contact: string; preferredTime: 'weekdayDay' | 'weekdayEvening' | 'weekend' | 'any'; topic: string; createdAt: string; contacted: boolean }

const id = () => crypto.randomUUID();
const today = studioToday();
const iso = (n: number) => addDays(today, n);
const nextOpen = (n: number) => { let d = iso(n); while (rangesFor(availability, d).length === 0) d = addDays(d, 1); return d; };
const nowIso = () => new Date().toISOString();
/** an ISO date n months back (when a demo student started lessons) */
const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString(); };

export const UNDO_MS = 30_000;
export const ALERT_DELAY_MS = 10_000;

function seed() {
  const users: MUser[] = [
    { id: 't1', name: 'Iris Chen', role: 'Teacher', status: 'Active', email: 'iris@studio.local', password: 'change-me-now', phone: null, lineId: 'iris.voice', lineLinked: false, voiceType: null, goal: null, grade: null, credits: 0, packageSize: 0, createdAt: nowIso(),
      emailVerified: true, lineIdPublic: true, teacherStatus: 'normal', statusLabel: null, statusMessage: null, avatarUrl: null },
    { id: 's1', skills: ['呼吸', 'Riffing', 'Belting', 'Chest voice', 'Mix', 'Airy'], growthLevel: 3, studentNo: 1001, gender: 'M', joinedAt: monthsAgo(14), name: '王小明', role: 'Student', status: 'Active', email: 'xiaoming@demo.local', password: 'demo1234', phone: '0912-345-678', lineId: 'xiaoming_w', lineLinked: true, voiceType: '男高音', goal: '想在年底婚禮上唱一首歌，高音更穩定。', grade: 'Grade 4', credits: 5, packageSize: 8, createdAt: nowIso() },
    { id: 's2', studentNo: 1002, gender: 'F', joinedAt: monthsAgo(9), name: '林佳穎', role: 'Student', status: 'Active', email: 'jiaying@demo.local', password: 'demo1234', phone: null, lineId: 'jiaying', lineLinked: true, voiceType: '女高音', goal: null, grade: 'Grade 2', credits: 3, packageSize: 4, createdAt: nowIso() },
    { id: 's3', studentNo: 1003, gender: 'F', joinedAt: monthsAgo(22), classType: 'group', name: '陳雅婷', role: 'Student', status: 'Active', email: 'yating@demo.local', password: 'demo1234', phone: null, lineId: 'yating', lineLinked: true, voiceType: '女中音', goal: null, grade: 'Grade 3', credits: 1, packageSize: 4, createdAt: nowIso() },
    { id: 's4', studentNo: 1004, gender: 'M', joinedAt: monthsAgo(5), name: '張家豪', role: 'Student', status: 'Active', email: 'jiahao@demo.local', password: 'demo1234', phone: null, lineId: 'jiahao', lineLinked: true, voiceType: '男中音', goal: null, grade: 'Grade 5', credits: 5, packageSize: 8, createdAt: nowIso() },
    { id: 's5', studentNo: 1005, gender: 'F', joinedAt: monthsAgo(3), name: '李思涵', role: 'Student', status: 'Active', email: 'sihan@demo.local', password: 'demo1234', phone: null, lineId: 'sihan', lineLinked: true, voiceType: '女高音', goal: null, grade: 'Grade 1', credits: 0, packageSize: 4, createdAt: nowIso() },
    { id: 's6', studentNo: 1006, gender: 'F', joinedAt: monthsAgo(0), classType: 'trial', name: '吳詠晴', role: 'Student', status: 'Pending', email: 'yongqing@demo.local', password: 'demo1234', phone: null, lineId: 'yongqing', lineLinked: true, voiceType: null, goal: null, grade: null, credits: 0, packageSize: 0, createdAt: nowIso() },
    { id: 's7', studentNo: 1007, gender: 'M', joinedAt: monthsAgo(11), name: '周子翔', role: 'Student', status: 'Active', email: 'zixiang@demo.local', password: 'demo1234', phone: null, lineId: 'zixiang', lineLinked: true, voiceType: '男中音', goal: null, grade: null, credits: 4, packageSize: 8, createdAt: nowIso() },
    { id: 's8', studentNo: 1008, gender: 'F', joinedAt: monthsAgo(7), name: '黃郁庭', role: 'Student', status: 'Active', email: 'yuting@demo.local', password: 'demo1234', phone: null, lineId: 'yuting', lineLinked: true, voiceType: '女高音', goal: null, grade: null, credits: 6, packageSize: 8, createdAt: nowIso() },
    { id: 's9', studentNo: 1009, gender: 'F', joinedAt: monthsAgo(16), name: '劉品妤', role: 'Student', status: 'Active', email: 'pinyu@demo.local', password: 'demo1234', phone: null, lineId: 'pinyu', lineLinked: true, voiceType: '女中音', goal: null, grade: null, credits: 2, packageSize: 4, createdAt: nowIso() },
    { id: 's10', studentNo: 1010, gender: 'M', joinedAt: monthsAgo(2), name: '蔡承恩', role: 'Student', status: 'Active', email: 'chengen@demo.local', password: 'demo1234', phone: null, lineId: 'chengen', lineLinked: true, voiceType: '男高音', goal: null, grade: null, credits: 3, packageSize: 4, createdAt: nowIso() },
    { id: 's11', studentNo: 1011, gender: 'F', joinedAt: monthsAgo(30), name: '鄭雅文', role: 'Student', status: 'Active', email: 'yawen@demo.local', password: 'demo1234', phone: null, lineId: 'yawen', lineLinked: true, voiceType: '女高音', goal: null, grade: null, credits: 0, packageSize: 8, createdAt: nowIso() },
    { id: 's12', studentNo: 1012, gender: 'M', joinedAt: monthsAgo(6), name: '許書豪', role: 'Student', status: 'Active', email: 'shuhao@demo.local', password: 'demo1234', phone: null, lineId: 'shuhao', lineLinked: true, voiceType: '男低音', goal: null, grade: null, credits: 0, packageSize: 4, createdAt: nowIso() },
  ];
  const t2 = nextOpen(2), t7 = nextOpen(7), t3 = nextOpen(3), t5 = nextOpen(5);
  const lessons: MLesson[] = [
    { id: 'l1', studentId: 's1', date: iso(-2), time: '14:00', status: 'Attended' },
    { id: 'l14', studentId: 's1', date: iso(-9), time: '14:00', status: 'Cancelled', refunded: true, cancelReason: 'reported' }, // 王小明 reported it, Iris approved (demo: 已取消 1)
    { id: 'l2', studentId: 's1', date: t2, time: '17:00', status: 'Booked' },
    { id: 'l3', studentId: 's1', date: t7, time: '11:00', status: 'Booked' },
    { id: 'l4', studentId: 's2', date: today, time: '09:30', status: weekday(today) === 0 ? 'Booked' : 'Attended' },
    { id: 'l5', studentId: 's3', date: today, time: '14:00', status: 'Booked' },
    { id: 'l6', studentId: 's4', date: today, time: '17:00', status: 'Booked' },
    { id: 'l7', studentId: 's3', date: t3, time: '11:00', status: 'Booked' },
    { id: 'l8', studentId: 's2', date: t5, time: '14:00', status: 'Booked', type: 'trial' },
    { id: 'l9', studentId: 's4', date: today, time: '18:30', status: 'Booked', type: 'group' }, // evening class so the home screen shows a 下一堂 in the demo
    { id: 'l10', studentId: 's1', date: nextOpen(10), time: '11:00', status: 'Booked' }, // Iris proposed another time for this one (demo)
    { id: 'l11', studentId: 's4', date: iso(-1), time: '17:00', status: 'Attended' }, // 張家豪 reported this one (demo: waiting for Iris)
    { id: 'l12', studentId: 's1', date: iso(-9), time: '17:00', status: 'Attended' }, // older than the 7-day window: no 回報 button
    { id: 'l15', studentId: 's5', date: iso(-20), time: '11:00', status: 'Attended' }, // used her last credit recently → 未購買課程
    { id: 'l16', studentId: 's11', date: iso(-150), time: '14:00', status: 'Attended' }, // quiet for 5 months → 冷漠
    { id: 'l13', studentId: 's1', date: iso(-16), time: '14:00', status: 'Attended' },
  ];
  // fill a few slots so the "full" states are visible
  const fill: [number, string[] | 'all'][] = [[1, ['09:30', '14:00']], [3, ['11:00', '15:30']], [4, 'all'], [6, ['17:00']], [8, ['11:00', '14:00', '17:00']]];
  fill.forEach(([n, which], i) => {
    const d = nextOpen(n);
    const times = which === 'all' ? slotTimesFor(availability, d) : which;
    times.forEach((t, j) => { if (!lessons.some((l) => l.date === d && l.time === t)) lessons.push({ id: `f${i}${j}`, studentId: 's4', date: d, time: t, status: 'Booked' }); });
  });
  const changes: MChange[] = [
    { id: 'c1', lessonId: 'l3', toDate: nextOpen(8), toTime: '18:30', reason: '那天公司臨時要加班，抱歉！', status: 'Open' },
    { id: 'c2', lessonId: 'l7', toDate: nextOpen(1), toTime: '14:00', reason: '想換到下午。', status: 'Open' },
    { id: 'c9', lessonId: 'l12', toDate: iso(-9), toTime: '17:00', reason: '原本那天要出差。', status: 'Approved', decidedAt: Date.now() - 12 * 864e5, prev: { date: iso(-10), time: '14:00' } }, // a past lesson that was moved → ↻
    { id: 'c3', lessonId: 'l10', toDate: nextOpen(11), toTime: '14:00', reason: '那天早上我要參加研習，下午可以嗎？', status: 'Open', by: 'teacher', createdAt: Date.now() - 36e5 },
  ];
  const alerts: MAlert[] = [
    { id: id(), userId: 's1', kind: 'payment', title: '付款已確認', body: '4 堂已加入你的帳號。', createdAt: new Date(Date.now() - 864e5).toISOString(), read: false, sendAfter: 0 },
    { id: id(), userId: 's1', kind: 'added', title: '老師新增了一堂課', body: '已加到你的行事曆。', createdAt: new Date(Date.now() - 3 * 864e5).toISOString(), read: true, sendAfter: 0 },
    { id: id(), userId: 's1', kind: 'welcome', title: '歡迎加入 Iris 聲樂工作室', body: '帳號已確認，可以開始預約。', createdAt: new Date(Date.now() - 30 * 864e5).toISOString(), read: true, sendAfter: 0 },
  ];
  const payments: MPayment[] = [
    { id: 'p1', studentId: 's5', packageSize: 8, amount: 6200, status: 'Pending', uploadedAt: new Date(Date.now() - 12 * 36e5).toISOString(), note: null, rejectReason: null, receiptUrl: '', lqip: null },
    { id: 'p2', studentId: 's3', packageSize: 4, amount: 3200, status: 'Pending', uploadedAt: new Date(Date.now() - 36 * 36e5).toISOString(), note: '已轉帳，末五碼 12345', rejectReason: null, receiptUrl: '', lqip: null },
    { id: 'p10', studentId: 's5', packageSize: 4, amount: 3200, status: 'Confirmed', uploadedAt: new Date(Date.now() - 60 * 864e5).toISOString(), note: null, rejectReason: null, receiptUrl: '', lqip: null },
    { id: 'p9', studentId: 's11', packageSize: 8, amount: 6200, status: 'Confirmed', uploadedAt: new Date(Date.now() - 180 * 864e5).toISOString(), note: null, rejectReason: null, receiptUrl: '', lqip: null },
    { id: 'p3', studentId: 's1', packageSize: 4, amount: 3200, status: 'Confirmed', uploadedAt: new Date(Date.now() - 30 * 864e5).toISOString(), note: null, rejectReason: null, receiptUrl: '', lqip: null },
  ];
  const consults: MConsult[] = [];
  // demo: 王小明 agreed to media use at sign-up, 陳雅婷 agreed and later withdrew (Iris sees both on the student page)
  const v = '2026-11-08.v0.1-draft', ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
  const consents: MConsent[] = [
    ...['s1', 's2', 's3', 's4', 's5'].flatMap((u) => (['terms', 'privacy'] as const).map((k) => ({ id: `ct-${u}-${k}`, userId: u, kind: k, granted: true, version: v, scope: '', source: 'register' as const, at: ago(40) }))),
    { id: 'cm-s1', userId: 's1', kind: 'media', granted: true, version: v, scope: 'photo,video,voice', source: 'register', at: ago(40) },
    { id: 'cm-s2a', userId: 's2', kind: 'media', granted: true, version: v, scope: 'photo,video,voice', source: 'register', at: ago(40) },
    { id: 'cm-s2b', userId: 's2', kind: 'media', granted: false, version: v, scope: 'photo,video,voice', source: 'profile', at: ago(3) },
  ];
  const privacyRequests: MPrivacyRequest[] = [];
  const reports: MReport[] = [
    { id: 'r1', lessonId: 'l11', studentId: 's4', reason: '那天發燒在家休息，沒有去上課。', status: 'Open', message: null, createdAt: new Date(Date.now() - 5 * 36e5).toISOString() },
    { id: 'r2', lessonId: 'l14', studentId: 's1', reason: '那天臨時重感冒，請假沒去。', status: 'Approved', message: null, createdAt: new Date(Date.now() - 9 * 864e5).toISOString(), decidedAt: Date.now() - 8 * 864e5, waived: true },
  ];
  const fees: MFee[] = [];
  // 精彩片段 — Iris's 8 Reels; titles are placeholders she renames in 更多 › IG Reels. coverUrl null = the site uses a sample photo.
  const reels: MReel[] = ['Dc_LQRduKf0', 'DZXNjLMRvry', 'DQ6667yk1NP', 'DNDn0AkxO9b', 'DEVDWcaSplt', 'C9mI7YjxZ4a', 'C5fhPr9RICt', 'DXbgjVJyTd8']
    .map((code, i) => ({ id: `rl${i + 1}`, sortOrder: i + 1, title: ['發聲暖身', '高音練習', '學生成果', '換聲區小技巧', '敬拜團培訓', '工作室日常', '合唱練習', '演出花絮'][i], url: `https://www.instagram.com/reel/${code}/`, coverUrl: null, deletedAt: null }));
  const resetTokens: MResetToken[] = [];
  const notes: MNote[] = [];
  const lessonNotes: LessonNote[] = [];
  return { notes, lessonNotes, users, lessons, changes, alerts, payments, consults, consents, privacyRequests, reports, fees, resetTokens, reels };
}

export const db = seed();
/** idempotency store: key → saved response (#19) */
export const idem = new Map<string, { userId: string; hash: string; status: number; body: unknown }>();

export const userById = (uid: string) => db.users.find((u) => u.id === uid);

export function lessonDto(l: MLesson): Lesson {
  const ch = db.changes.find((c) => c.lessonId === l.id && c.status === 'Open');
  const rp = db.reports.filter((r) => r.lessonId === l.id && r.status !== 'Withdrawn').at(-1);
  const fee = rp && db.fees.find((f) => f.reportId === rp.id);
  return {
    id: l.id, date: l.date, time: l.time, status: l.status, type: l.type ?? 'private', minutes: l.minutes ?? 60, room: 'A 教室', studentId: l.studentId,
    studentName: userById(l.studentId)?.name ?? '', change: ch ? { id: ch.id, toDate: ch.toDate, toTime: ch.toTime, reason: ch.reason, by: ch.by ?? 'student' } : null,
    report: rp ? { id: rp.id, status: rp.status.toLowerCase() as 'open' | 'approved' | 'declined', reason: rp.reason, message: rp.message, fee: fee?.amount ?? null } : null,
    reportUntil: !rp ? reportUntil(l) : null,
  };
}
/** 回報 window: an Attended lesson, until STUDIO.reportDays after it ended */
export function reportUntil(l: MLesson): string | null {
  if (l.status !== 'Attended') return null;
  const until = lessonStart(l) + (l.minutes ?? 60) * 60_000 + STUDIO.reportDays * 864e5;
  return until > Date.now() ? new Date(until).toISOString() : null;
}

/** A slot is taken if any booked lesson overlaps it (break included) — not just one at the same start time. */
export function isTaken(date: string, time: string, exceptLessonId?: string) {
  const { lessonMinutes, gapMinutes } = availability.settings;
  return db.lessons.some((l) => l.date === date && l.status === 'Booked' && l.id !== exceptLessonId
    && overlaps(time, lessonMinutes, { time: l.time, minutes: l.minutes ?? 60 }, gapMinutes));
}
export function slotPast(date: string, time: string) {
  const t = studioToday();
  return date < t || (date === t && time <= studioNowTime());
}
export function validSlot(date: string, time: string): string | null {
  if (date > addDays(studioToday(), availability.settings.advanceDays)) return `最多只能預約 ${availability.settings.advanceDays} 天內的課。`;
  if (rangesFor(availability, date).length === 0) return '這天不開放預約。';
  if (!slotTimesFor(availability, date).includes(time)) return '這不是上課時段。';
  if (slotPast(date, time)) return '這個時段已經過了。';
  return null;
}
export function lessonStart(l: { date: string; time: string }): number {
  return new Date(`${l.date}T${l.time}:00+08:00`).getTime();
}

export function addAlert(userId: string, kind: AlertKind, title: string, body: string, source?: string) {
  // Delayed (#5): Iris can undo for a few seconds, and the student never sees a reversed decision.
  db.alerts.push({ id: id(), userId, kind, title, body, createdAt: nowIso(), read: false, sendAfter: Date.now() + ALERT_DELAY_MS, source });
}
export function dropQueuedAlerts(source: string) {
  const now = Date.now();
  db.alerts = db.alerts.filter((a) => !(a.source === source && a.sendAfter > now));
}

export const newId = id;

/**
 * Auto 已上課 (decided 8 Nov): a lesson that is still Booked when its END time has passed becomes Attended.
 * Cancelled lessons never get here (they are no longer Booked). Open change requests on it are closed.
 * Same rule as server/Services/AttendanceSettler.cs; the mock runs it before every API call.
 */
export function settleAttendance(now = Date.now()) {
  for (const l of db.lessons) {
    if (l.status !== 'Booked') continue;
    if (lessonStart(l) + (l.minutes ?? 60) * 60_000 > now) continue;
    l.status = 'Attended';
    for (const c of db.changes) if (c.lessonId === l.id && c.status === 'Open') c.status = 'Declined';
  }
}
