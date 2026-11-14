// JSON shapes the API sends and receives. Mirrors server/IrisStudio.Api/Contracts.

export type Role = 'Student' | 'Teacher';
export type UserStatus = 'Pending' | 'Active';

export interface Me {
  id: string;
  name: string;
  role: Role;
  status: UserStatus;
  email: string | null;
  phone: string | null;
  lineId: string | null;
  lineLinked: boolean;
  voiceType: string | null;
  goal: string | null;
  grade: string | null;
  avatarUrl: string | null;
  /** sessions not yet booked */
  credits: number;
  booked: number;
  attended: number;
  /** cancelled too late — the credit was used (shown as 已取消 on the quota card) */
  cancelled?: number;
  /** past classes the student reported (回報) and Iris approved — the credit came back (shown as 取消 in red) */
  reported?: number;
  /** size of the current package (4 or 8), for the quota boxes */
  packageSize: number;
  unreadAlerts: number;
  /** what kind of student this is (set by Iris) — decides the lesson type when booking */
  classType: LessonType;
  /** a 體驗 student who hasn't bought the trial yet: the 單堂課 package is offered */
  trialAvailable: boolean;
}

export type LessonStatus = 'Booked' | 'Attended' | 'Cancelled';
/** private = 一對一, group = 團體課, trial = 單堂課 */
export type LessonType = 'private' | 'group' | 'trial';

export interface ChangeInfo {
  id: string;
  toDate: string;
  toTime: string;
  /** student's reason, or Iris's message when she proposed it */
  reason: string;
  /** student = 學生申請, Iris decides · teacher = 老師提議, the student decides */
  by: 'student' | 'teacher';
}

export interface Lesson {
  id: string;
  date: string; // YYYY-MM-DD (studio time)
  time: string; // HH:mm
  status: LessonStatus;
  type: LessonType;
  /** lesson length in minutes */
  minutes: number;
  room: string;
  studentId: string;
  studentName: string;
  change: ChangeInfo | null;
  /** 回報 on this past lesson (the latest one that wasn't withdrawn) */
  report: LessonReportInfo | null;
  /** set while the student may still 回報 this lesson (Attended, inside Studio:ReportDays, no report yet) */
  reportUntil: string | null;
  /** teacher 今天的課 only: which 課堂筆記 this lesson has (null = none yet) */
  noteKind?: LessonNoteKind | null;
}

export type LessonNoteKind = 'text' | 'image';
/** 課堂筆記: rich text OR one screenshot (stored as WebP, named yyyyMMdd_學生_Class_Notes.webp) */
export interface LessonNote {
  lessonId: string; studentId: string; kind: LessonNoteKind;
  html: string | null; imageUrl: string | null; fileName: string | null; lqip: string | null;
  width: number | null; height: number | null; updatedAt: string;
}

/** 回報 = the student asks Iris to cancel a lesson that already passed (e.g. they didn't come). */
export type ReportStatus = 'open' | 'approved' | 'declined';
export interface LessonReportInfo {
  id: string;
  status: ReportStatus;
  reason: string | null;
  /** Iris's reason when she declined */
  message: string | null;
  /** 取消費 charged when approved (null = none / waived) */
  fee: number | null;
}
/** A report waiting for Iris (收件匣 → 申請 → 回報) */
export interface LessonReport {
  id: string; lessonId: string; studentId: string; studentName: string;
  date: string; time: string; minutes: number; reason: string | null; createdAt: string;
}
/** 取消費: Unpaid → Billed (attached to the next receipt) → Paid (receipt confirmed) */
export type FeeStatus = 'unpaid' | 'billed' | 'paid';
export interface CancellationFee { id: string; lessonId: string; date: string; time: string; amount: number; status: FeeStatus; paymentId: string | null }

/** later = beyond 可提前預約 (not open for booking yet) */
export type DayState = 'open' | 'closed' | 'full' | 'past' | 'later';
export interface Day { date: string; state: DayState }
export type SlotState = 'free' | 'full' | 'past';
export interface Slot { time: string; state: SlotState }

export type AlertKind = 'moved' | 'approved' | 'declined' | 'payment' | 'added' | 'welcome' | 'cancelled' | 'reminder' | 'proposal' | 'report' | 'homework';
export interface AlertItem {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export type PaymentStatus = 'Pending' | 'Confirmed' | 'Rejected';
export interface Payment {
  id: string;
  studentId: string;
  studentName: string;
  /** the student's profile photo (null → initial in a circle) */
  studentAvatarUrl?: string | null;
  packageSize: number;
  amount: number;
  status: PaymentStatus;
  uploadedAt: string;
  note: string | null;
  rejectReason: string | null;
  receiptUrl: string;
  /** tiny blurred preview as a data: URL, made by the server at upload (#8) */
  lqip: string | null;
  /** bought the one-time 單堂課 package */
  trial?: boolean;
  /** 取消費 billed on this receipt; amount = package price + these */
  fees?: { id: string; amount: number; date: string; time: string }[];
}

/** What kind of student this is (set by Iris): private = 一對一, group = 團體課, trial = 單堂課 */
export type ClassType = 'private' | 'group' | 'trial';

export interface StudentSummary {
  id: string;
  name: string;
  status: UserStatus;
  classType: ClassType;
  /** Iris marked the consultation / interview done → the student may buy one 單堂課 */
  consultationCompleted?: boolean;
  credits: number;
  booked: number;
  nextLesson: { date: string; time: string } | null;
  paymentPending: boolean;
  lineId: string | null;
  voiceType: string | null;
  /** 學號 shown as ID in the 學生列表 */
  studentNo: number;
  gender: 'M' | 'F' | null;
  /** when the student started lessons → 上課資年 (months) */
  joinedAt: string;
  avatarUrl: string | null;
  /** 停用: kept for history, can't book */
  disabled: boolean;
  /** 學生列表 filter: 活躍 / 未上單堂課 / 未購買課程 / 冷漠 (null = pending or 停用) */
  segment: 'active' | 'noTrial' | 'lapsed' | 'cold' | null;
}

export interface StudentDetail extends StudentSummary {
  email: string | null;
  phone: string | null;
  grade: string | null;
  goal: string | null;
  attended: number;
  packageSize: number;
  upcoming: Lesson[];
  past: Lesson[];
  payments: Payment[];
  /** where 通知學生繳學費 goes: LINE if the student signed in with LINE, else email; null = no way to reach them */
  remindChannel: 'line' | 'email' | null;
  lastRemindedAt: string | null;
  /** 個人資料 header numbers */
  firstLessonDate: string | null;
  firstPurchaseAt: string | null;
  /** sum of confirmed payments (NT$) */
  totalPaid: number;
  /** how the student signs in: LINE or email + password */
  loginMethod: 'line' | 'email';
  /** 課程 page: skill badges Iris gives (e.g. 呼吸, Belting) */
  skills: string[];
  /** 成長等級 0–10, set by Iris */
  growthLevel: number;
  /** 缺課: lessons cancelled late (no refund) or cancelled through 回報 */
  missed: number;
  /** 總堂數: lessons taken + booked (not cancelled) */
  totalLessons: number;
  /** past lessons that were moved once (改時間 approved) → ↻ in the history */
  movedLessonIds: string[];
  /** 個人資料 banner set by Iris (null = default sage gradient) */
  coverUrl?: string | null;
  /** what Iris may do with this student's photos / videos / voice, and marketing — latest consent record */
  consent: StudentConsentSummary;
}

export interface ChangeRequest {
  id: string;
  lessonId: string;
  studentId: string;
  studentName: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  reason: string;
  slotFree: boolean;
  createdAt: string;
}

export interface Application { id: string; name: string; email: string | null; createdAt: string }
/** A time change Iris proposed (老師提議). Open = waiting for the student; answered ones stay 7 days. */
export interface Proposal {
  id: string; lessonId: string; studentId: string; studentName: string;
  fromDate: string; fromTime: string; toDate: string; toTime: string;
  message: string; status: 'open' | 'approved' | 'declined'; createdAt: string; decidedAt: string | null;
}
export interface Requests { changes: ChangeRequest[]; applications: Application[]; proposals: Proposal[]; reports: LessonReport[] }

export interface Overview {
  today: Lesson[];
  counts: { receipts: number; receiptsAmount: number; changes: number; reports: number; applications: number; consults: number };
  outOfQuota: StudentSummary[];
}

export type ConsultContactType = 'line' | 'email';
/** When the visitor is easiest to reach — a rough window, not a booking. */
export type ConsultTime = 'weekdayDay' | 'weekdayEvening' | 'weekend' | 'any';

export interface Consult {
  id: string;
  name: string;
  contactType: ConsultContactType;
  contact: string;
  preferredTime: ConsultTime;
  topic: string;
  createdAt: string;
  contacted: boolean;
}

export interface StudioInfo {
  /** length of a newly booked lesson (from Iris's 預約設定) */
  lessonMinutes: number;
  cancelHours: number;
  /** 改時間 only allowed this many hours before the lesson (12) */
  moveHours: number;
  /** 回報 allowed until this many days after the lesson ended (7) */
  reportDays: number;
  /** 取消費 when Iris approves a 回報 (NT$ 500) */
  cancelFee: number;
  /** trial = the 1-lesson 單堂課, only offered while me.trialAvailable */
  packages: { size: number; price: number; trial?: boolean }[];
  bank: { name: string; account: string; holder: string };
  /** what students may see about Iris (lineId only when she made it public) */
  teacher: TeacherPublic;
}

/** 正常上課 / 放假中 / 暫停接新學生 / 自訂 */
export type TeacherStatus = 'normal' | 'vacation' | 'noNewStudents' | 'custom';
export interface TeacherPublic { name: string; avatarUrl: string | null; status: TeacherStatus; statusLabel: string | null; statusMessage: string | null; lineId: string | null }
/** 教師個人資料. Public profile (name, avatar, contact LINE ID, status) is separate from the sign-in bindings (email, LINE Login). */
export interface TeacherProfile {
  name: string; email: string | null; emailVerified: boolean; lineLinked: boolean; hasPassword: boolean;
  lineId: string | null; lineIdPublic: boolean; avatarUrl: string | null;
  status: TeacherStatus; statusLabel: string | null; statusMessage: string | null;
}

export interface BookResult { lesson: Lesson; creditsLeft: number }
export interface CancelResult { refunded: boolean; creditsLeft: number; undoUntil: string }

/* ---------- Iris's availability (可預約時段) ---------- */
export interface TimeRange { start: string; end: string } // "HH:mm"
export interface WeeklyDay { weekday: number; enabled: boolean; ranges: TimeRange[] } // 0 = Sunday
/** A special date: closed all day, or its own hours instead of the weekly pattern. */
export interface DateOverride { date: string; closed: boolean; ranges: TimeRange[]; note: string }
export interface BookingSettings { lessonMinutes: number; gapMinutes: number; advanceDays: number }
export interface Availability { settings: BookingSettings; weekly: WeeklyDay[]; overrides: DateOverride[] }

/* ---------- consent records & privacy requests ---------- */
export type ConsentKind = 'terms' | 'privacy' | 'media' | 'marketing' | 'guardian';
export interface GuardianInput { name: string; relation: string; contact: string; agreed: boolean }
/** what the sign-up form / 同意設定 sends. Append-only on the server: every change is a new record. */
export interface ConsentInput { version: string; terms: boolean; media: boolean; marketing: boolean; minor: boolean; guardian: GuardianInput | null }
export interface ConsentRecord { kind: ConsentKind; granted: boolean; version: string; at: string; source: 'register' | 'profile' | 'request' }
export interface MyConsents {
  media: { granted: boolean; at: string | null };
  marketing: { granted: boolean; at: string | null };
  minor: boolean; guardianName: string | null;
  history: ConsentRecord[];
}
export interface StudentConsentSummary { media: boolean; mediaAt: string | null; mediaWithdrawn: boolean; marketing: boolean; minor: boolean }
/** 個資法 §3 rights + withdrawing an optional consent */
export type PrivacyRequestType = 'access' | 'copy' | 'correct' | 'stop' | 'delete' | 'withdraw';
export interface PrivacyRequest {
  id: string; name: string; contact: string; type: PrivacyRequestType; detail: string;
  status: 'open' | 'done'; createdAt: string; dueAt: string; handledAt: string | null; note: string | null;
}

/** 精彩片段 — an Instagram Reel shown on the website (max 8, ordered by sortOrder). */
export interface Reel { id: string; sortOrder: number; title: string; url: string; coverUrl: string | null; coverLqip?: string | null }
