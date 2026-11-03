// In-memory stand-in for the .NET API, used by `npm run dev:mock` and the e2e tests.
// It follows the same business rules as server/IrisStudio.Api/Services/BookingService.cs,
// so the UI can be built and tested before the backend runs.
import { addDays, studioNowTime, studioToday, weekday } from '../lib/date';
import type { AlertItem, AlertKind, Lesson, Payment, StudioInfo } from '../lib/types';

export const STUDIO: StudioInfo = {
  slots: ['09:30', '10:30', '11:30', '14:00', '15:00', '16:30', '17:30', '19:00'],
  closedWeekdays: [0],
  cancelHours: 24,
  packages: [{ size: 4, price: 3200 }, { size: 8, price: 6200 }],
  bank: { name: '[銀行名稱]', account: '[帳號]', holder: '[戶名]' },
};

export interface MUser {
  id: string; name: string; role: 'Student' | 'Teacher'; status: 'Pending' | 'Active';
  email: string | null; password?: string; phone: string | null; lineId: string | null; lineLinked: boolean;
  voiceType: string | null; goal: string | null; grade: string | null;
  credits: number; packageSize: number; createdAt: string; declined?: boolean;
}
export interface MChange { id: string; lessonId: string; toDate: string; toTime: string; reason: string; status: 'Open' | 'Approved' | 'Declined' | 'Withdrawn'; decidedAt?: number; prev?: { date: string; time: string } }
export interface MLesson { id: string; studentId: string; date: string; time: string; status: 'Booked' | 'Attended' | 'Cancelled'; cancelledAt?: number; refunded?: boolean; byTeacher?: boolean }
export interface MAlert extends AlertItem { userId: string; sendAfter: number; source?: string }
export interface MPayment extends Omit<Payment, 'studentName'> { decidedAt?: number }
export interface MConsult { id: string; name: string; contact: string; preferredDate: string; topic: string; createdAt: string; contacted: boolean }

const id = () => crypto.randomUUID();
const today = studioToday();
const iso = (n: number) => addDays(today, n);
const nextOpen = (n: number) => { let d = iso(n); while (weekday(d) === 0) d = addDays(d, 1); return d; };
const nowIso = () => new Date().toISOString();

export const UNDO_MS = 30_000;
export const ALERT_DELAY_MS = 10_000;

function seed() {
  const users: MUser[] = [
    { id: 't1', name: 'Iris', role: 'Teacher', status: 'Active', email: 'iris@studio.local', password: 'change-me-now', phone: null, lineId: null, lineLinked: false, voiceType: null, goal: null, grade: null, credits: 0, packageSize: 0, createdAt: nowIso() },
    { id: 's1', name: '王小明', role: 'Student', status: 'Active', email: 'xiaoming@demo.local', password: 'demo1234', phone: '0912-345-678', lineId: 'xiaoming_w', lineLinked: true, voiceType: '男高音', goal: '想在年底婚禮上唱一首歌，高音更穩定。', grade: 'Grade 4', credits: 2, packageSize: 4, createdAt: nowIso() },
    { id: 's2', name: '林佳穎', role: 'Student', status: 'Active', email: 'jiaying@demo.local', password: 'demo1234', phone: null, lineId: 'jiaying', lineLinked: true, voiceType: '女高音', goal: null, grade: 'Grade 2', credits: 3, packageSize: 4, createdAt: nowIso() },
    { id: 's3', name: '陳雅婷', role: 'Student', status: 'Active', email: 'yating@demo.local', password: 'demo1234', phone: null, lineId: 'yating', lineLinked: true, voiceType: '女中音', goal: null, grade: 'Grade 3', credits: 1, packageSize: 4, createdAt: nowIso() },
    { id: 's4', name: '張家豪', role: 'Student', status: 'Active', email: 'jiahao@demo.local', password: 'demo1234', phone: null, lineId: 'jiahao', lineLinked: true, voiceType: '男中音', goal: null, grade: 'Grade 5', credits: 5, packageSize: 8, createdAt: nowIso() },
    { id: 's5', name: '李思涵', role: 'Student', status: 'Active', email: 'sihan@demo.local', password: 'demo1234', phone: null, lineId: 'sihan', lineLinked: true, voiceType: '女高音', goal: null, grade: 'Grade 1', credits: 0, packageSize: 4, createdAt: nowIso() },
    { id: 's6', name: '吳詠晴', role: 'Student', status: 'Pending', email: 'yongqing@demo.local', password: 'demo1234', phone: null, lineId: 'yongqing', lineLinked: true, voiceType: null, goal: null, grade: null, credits: 0, packageSize: 0, createdAt: nowIso() },
  ];
  const t2 = nextOpen(2), t7 = nextOpen(7), t3 = nextOpen(3), t5 = nextOpen(5);
  const lessons: MLesson[] = [
    { id: 'l1', studentId: 's1', date: iso(-2), time: '14:00', status: 'Attended' },
    { id: 'l2', studentId: 's1', date: t2, time: '16:30', status: 'Booked' },
    { id: 'l3', studentId: 's1', date: t7, time: '10:30', status: 'Booked' },
    { id: 'l4', studentId: 's2', date: today, time: '09:30', status: weekday(today) === 0 ? 'Booked' : 'Attended' },
    { id: 'l5', studentId: 's3', date: today, time: '14:00', status: 'Booked' },
    { id: 'l6', studentId: 's4', date: today, time: '16:30', status: 'Booked' },
    { id: 'l7', studentId: 's3', date: t3, time: '11:30', status: 'Booked' },
    { id: 'l8', studentId: 's2', date: t5, time: '14:00', status: 'Booked' },
  ];
  // fill a few slots so the "full" states are visible
  const fill: [number, string[]][] = [[1, ['09:30', '14:00']], [3, ['10:30', '15:00']], [4, STUDIO.slots], [6, ['17:30']], [8, ['10:30', '14:00', '17:30']]];
  fill.forEach(([n, times], i) => {
    const d = nextOpen(n);
    times.forEach((t, j) => { if (!lessons.some((l) => l.date === d && l.time === t)) lessons.push({ id: `f${i}${j}`, studentId: 's4', date: d, time: t, status: 'Booked' }); });
  });
  const changes: MChange[] = [
    { id: 'c1', lessonId: 'l3', toDate: nextOpen(8), toTime: '19:00', reason: '那天公司臨時要加班，抱歉！', status: 'Open' },
    { id: 'c2', lessonId: 'l7', toDate: nextOpen(1), toTime: '14:00', reason: '想換到下午。', status: 'Open' },
  ];
  const alerts: MAlert[] = [
    { id: id(), userId: 's1', kind: 'payment', title: '付款已確認', body: '4 堂已加入你的帳號。', createdAt: new Date(Date.now() - 864e5).toISOString(), read: false, sendAfter: 0 },
    { id: id(), userId: 's1', kind: 'added', title: '老師新增了一堂課', body: '已加到你的行事曆。', createdAt: new Date(Date.now() - 3 * 864e5).toISOString(), read: true, sendAfter: 0 },
    { id: id(), userId: 's1', kind: 'welcome', title: '歡迎加入 Iris 聲樂工作室', body: '帳號已確認，可以開始預約。', createdAt: new Date(Date.now() - 30 * 864e5).toISOString(), read: true, sendAfter: 0 },
  ];
  const payments: MPayment[] = [
    { id: 'p1', studentId: 's5', packageSize: 8, amount: 6200, status: 'Pending', uploadedAt: new Date(Date.now() - 12 * 36e5).toISOString(), note: null, rejectReason: null, receiptUrl: '', lqip: null },
    { id: 'p2', studentId: 's3', packageSize: 4, amount: 3200, status: 'Pending', uploadedAt: new Date(Date.now() - 36 * 36e5).toISOString(), note: '已轉帳，末五碼 12345', rejectReason: null, receiptUrl: '', lqip: null },
    { id: 'p3', studentId: 's1', packageSize: 4, amount: 3200, status: 'Confirmed', uploadedAt: new Date(Date.now() - 30 * 864e5).toISOString(), note: null, rejectReason: null, receiptUrl: '', lqip: null },
  ];
  const consults: MConsult[] = [];
  return { users, lessons, changes, alerts, payments, consults };
}

export const db = seed();
/** idempotency store: key → saved response (#19) */
export const idem = new Map<string, { userId: string; hash: string; status: number; body: unknown }>();

export const userById = (uid: string) => db.users.find((u) => u.id === uid);

export function lessonDto(l: MLesson): Lesson {
  const ch = db.changes.find((c) => c.lessonId === l.id && c.status === 'Open');
  return {
    id: l.id, date: l.date, time: l.time, status: l.status, room: 'A 教室', studentId: l.studentId,
    studentName: userById(l.studentId)?.name ?? '', change: ch ? { id: ch.id, toDate: ch.toDate, toTime: ch.toTime, reason: ch.reason } : null,
  };
}

export function isTaken(date: string, time: string, exceptLessonId?: string) {
  return db.lessons.some((l) => l.date === date && l.time === time && l.status === 'Booked' && l.id !== exceptLessonId);
}
export function slotPast(date: string, time: string) {
  const t = studioToday();
  return date < t || (date === t && time <= studioNowTime());
}
export function validSlot(date: string, time: string): string | null {
  if (!STUDIO.slots.includes(time)) return '這不是上課時段。';
  if (STUDIO.closedWeekdays.includes(weekday(date))) return '週日休息。';
  if (slotPast(date, time)) return '這個時段已經過了。';
  if (date > addDays(studioToday(), 60)) return '最多只能預約 60 天內的課。';
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
