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
  unreadAlerts: number;
  /** what kind of student this is (set by Iris) — decides the lesson type when booking */
  classType: LessonType;
  /** a 體驗 student who hasn't bought the trial yet: the 體驗課 package is offered */
  trialAvailable: boolean;
}

export type LessonStatus = 'Booked' | 'Attended' | 'Cancelled';
/** private = 一對一, group = 團體課, trial = 體驗課 */
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
}

/** later = beyond 可提前預約 (not open for booking yet) */
export type DayState = 'open' | 'closed' | 'full' | 'past' | 'later';
export interface Day { date: string; state: DayState }
export type SlotState = 'free' | 'full' | 'past';
export interface Slot { time: string; state: SlotState }

export type AlertKind = 'moved' | 'approved' | 'declined' | 'payment' | 'added' | 'welcome' | 'cancelled' | 'reminder' | 'proposal';
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
  /** bought the one-time 體驗課 package */
  trial?: boolean;
}

/** What kind of student this is (set by Iris): private = 一對一, group = 團體課, trial = 體驗課 */
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
export interface Requests { changes: ChangeRequest[]; applications: Application[]; proposals: Proposal[] }

export interface Overview {
  today: Lesson[];
  counts: { receipts: number; receiptsAmount: number; changes: number; applications: number; consults: number };
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
  /** trial = the 1-lesson 體驗課, only offered while me.trialAvailable */
  packages: { size: number; price: number; trial?: boolean }[];
  bank: { name: string; account: string; holder: string };
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
