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
}

export type LessonStatus = 'Booked' | 'Attended' | 'Cancelled';

export interface ChangeInfo {
  id: string;
  toDate: string;
  toTime: string;
  reason: string;
}

export interface Lesson {
  id: string;
  date: string; // YYYY-MM-DD (studio time)
  time: string; // HH:mm
  status: LessonStatus;
  room: string;
  studentId: string;
  studentName: string;
  change: ChangeInfo | null;
}

export type DayState = 'open' | 'closed' | 'full' | 'past';
export interface Day { date: string; state: DayState }
export type SlotState = 'free' | 'full' | 'past';
export interface Slot { time: string; state: SlotState }

export type AlertKind = 'moved' | 'approved' | 'declined' | 'payment' | 'added' | 'welcome' | 'cancelled';
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
}

export interface StudentSummary {
  id: string;
  name: string;
  status: UserStatus;
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
export interface Requests { changes: ChangeRequest[]; applications: Application[] }

export interface Overview {
  today: Lesson[];
  counts: { receipts: number; receiptsAmount: number; changes: number; applications: number; consults: number };
  outOfQuota: StudentSummary[];
}

export interface Consult {
  id: string;
  name: string;
  contact: string;
  preferredDate: string;
  topic: string;
  createdAt: string;
  contacted: boolean;
}

export interface StudioInfo {
  slots: string[];
  closedWeekdays: number[];
  cancelHours: number;
  packages: { size: number; price: number }[];
  bank: { name: string; account: string; holder: string };
}

export interface BookResult { lesson: Lesson; creditsLeft: number }
export interface CancelResult { refunded: boolean; creditsLeft: number; undoUntil: string }
