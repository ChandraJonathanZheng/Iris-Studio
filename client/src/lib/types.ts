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
  /** size of the current package (4 or 8), for the quota boxes */
  packageSize: number;
  /** of the attended lessons, how many were late cancels (counted, no refund) — shown as ✕ boxes */
  cancelled?: number;
  /** lessons cancelled afterwards by an approved 回報 */
  reported?: number;
  unreadAlerts: number;
  /** what kind of student this is (set by Iris) — decides the lesson type when booking */
  classType: LessonType;
  /** Iris confirmed a consultation/interview and the one-time 單堂課 has not been purchased */
  trialAvailable: boolean;
  /** the email above was confirmed through the link we sent */
  emailVerified: boolean;
  /** email preferences — account, security and payment emails are always sent */
  emailUpdates: boolean;
  emailReminders: boolean;
}

export interface NotificationPrefs { emailUpdates: boolean; emailReminders: boolean }

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
  /** the student's 回報 for this past lesson (latest one that wasn't withdrawn) */
  report: LessonReportInfo | null;
  /** until when 回報 is still possible (ISO); null = not reportable (not attended, window over, or already reported) */
  reportUntil: string | null;
}

/** 回報 = the student asks Iris to cancel a lesson that was counted as attended. */
export type ReportStatus = 'open' | 'approved' | 'declined' | 'withdrawn';
export interface LessonReportInfo {
  id: string;
  status: ReportStatus;
  reason: string | null;
  /** Iris's reason when she declined */
  message: string | null;
  /** 取消費 charged for an approved report; null = none (open, declined, or waived) */
  fee: number | null;
}
/** An open 回報 waiting in Iris's 申請 → 回報 tab. */
export interface LessonReport {
  id: string; lessonId: string; studentId: string; studentName: string;
  date: string; time: string; minutes: number; reason: string | null; createdAt: string;
}
/** 取消費: unpaid → billed (added to the next receipt) → paid (receipt confirmed). */
export type FeeStatus = 'unpaid' | 'billed' | 'paid';
export interface CancellationFee { id: string; lessonId: string; date: string; time: string; amount: number; status: FeeStatus; paymentId: string | null }

/** later = beyond 可提前預約 (not open for booking yet) */
export type DayState = 'open' | 'closed' | 'full' | 'past' | 'later';
export interface Day { date: string; state: DayState }
export type SlotState = 'free' | 'full' | 'past';
export interface Slot { time: string; state: SlotState }

export type AlertKind = 'moved' | 'approved' | 'declined' | 'payment' | 'added' | 'welcome' | 'cancelled' | 'reminder' | 'proposal' | 'report';
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
  /** 取消費 billed on this receipt (amount above already includes them) */
  fees?: { id: string; amount: number; date: string; time: string }[];
}

/** What kind of student this is (set by Iris): private = 一對一, group = 團體課, trial = 單堂課 */
export type ClassType = 'private' | 'group' | 'trial';

export interface StudentSummary {
  id: string;
  name: string;
  status: UserStatus;
  classType: ClassType;
  credits: number;
  booked: number;
  nextLesson: { date: string; time: string } | null;
  paymentPending: boolean;
  lineId: string | null;
  voiceType: string | null;
}

export interface StudentDetail extends StudentSummary {
  /** Iris confirmed a completed consultation or interview. */
  consultationCompleted: boolean;
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
  /** consultation slot Iris set (studio time), null until scheduled */
  scheduledDate: string | null;
  scheduledTime: string | null;
  scheduleNote: string | null;
}

export interface StudioInfo {
  /** length of a newly booked lesson (from Iris's 預約設定) */
  lessonMinutes: number;
  cancelHours: number;
  /** 改時間 only allowed this many hours before the lesson (12) */
  moveHours: number;
  /** 回報 allowed until this many days after the lesson (7) */
  reportDays: number;
  /** 取消費 for an approved 回報, NT$ (500) */
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

/* ---------- 精彩片段 (Instagram Reels on the website) ---------- */
export interface Reel { id: string; url: string; shortcode: string; thumbnailUrl: string; lqip: string | null; sortOrder: number; updatedAt: string }
export interface PublicReel { id: string; url: string; thumbnailUrl: string; lqip: string | null }
