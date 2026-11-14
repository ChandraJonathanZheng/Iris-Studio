import { busy } from '../components/Busy';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { LessonNote, Reel,
  AlertItem, Availability, BookingSettings, BookResult, DateOverride, CancelResult, ClassType, Consult, ConsultContactType, ConsultTime, Day, Lesson, Me, Overview, Payment, PaymentStatus,
  CancellationFee, Requests, Slot, StudentDetail, StudentSummary, StudioInfo, TeacherProfile, ConsentInput, MyConsents, PrivacyRequest, PrivacyRequestType,
} from './types';

/**
 * #6 Stale-while-revalidate: every query shows the cached copy first and refreshes in the background.
 * staleTime 30 s = data younger than that is shown without refetching at all.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 10 * 60_000, refetchOnWindowFocus: true, retry: 1 },
      mutations: { retry: 0 },
    },
  });
}

export const qk = {
  me: ['me'] as const,
  studio: ['studio'] as const,
  teacherProfile: ['teacher-profile'] as const,
  lessons: (scope: 'student' | 'teacher', from: string, to: string) => ['lessons', scope, from, to] as const,
  days: (from: string) => ['days', from] as const,
  slots: (date: string) => ['slots', date] as const,
  alerts: ['alerts'] as const,
  myPayments: ['payments', 'mine'] as const,
  overview: ['overview'] as const,
  students: ['students'] as const,
  student: (id: string) => ['students', id] as const,
  requests: ['requests'] as const,
  payments: (status: PaymentStatus | 'All') => ['payments', status] as const,
  consults: ['consults'] as const,
  availability: ['availability'] as const,
  myFees: ['fees', 'mine'] as const,
};

// ---------- queries ----------
export const useMe = () => useQuery({ queryKey: qk.me, queryFn: ({ signal }) => api.get<Me | null>('/api/me', signal), staleTime: 60_000 });
export const useStudio = () => useQuery({ queryKey: qk.studio, queryFn: () => api.get<StudioInfo>('/api/public/studio'), staleTime: Infinity });
export type PackageOption = StudioInfo['packages'][number];
/** 課程方案 editor: replaces the whole list; the server answers with the saved list. */
export function useSavePackages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (packages: PackageOption[]) => api.put<PackageOption[]>('/api/teacher/packages', { packages }),
    onSuccess: (packages) => qc.setQueryData<StudioInfo>(qk.studio, (s) => (s ? { ...s, packages } : s)),
  });
}
export const useLessons = (scope: 'student' | 'teacher', from: string, to: string) =>
  useQuery({ queryKey: qk.lessons(scope, from, to), queryFn: ({ signal }) => api.get<Lesson[]>(`/api/${scope}/lessons?from=${from}&to=${to}`, signal) });
/** A free slot can be taken at any second, so slot data is always re-checked (staleTime 0). */
export const useDays = (from: string) =>
  useQuery({ queryKey: qk.days(from), queryFn: ({ signal }) => api.get<Day[]>(`/api/slots/days?from=${from}&count=15`, signal), staleTime: 0 });
export const useSlots = (date: string | null) =>
  useQuery({ queryKey: qk.slots(date ?? ''), queryFn: ({ signal }) => api.get<Slot[]>(`/api/slots?date=${date}`, signal), enabled: !!date, staleTime: 0 });
export const useAlerts = () => useQuery({ queryKey: qk.alerts, queryFn: ({ signal }) => api.get<AlertItem[]>('/api/student/alerts', signal) });
export const useMyPayments = () => useQuery({ queryKey: qk.myPayments, queryFn: ({ signal }) => api.get<Payment[]>('/api/student/payments', signal) });
export const useMyFees = () => useQuery({ queryKey: qk.myFees, queryFn: ({ signal }) => api.get<CancellationFee[]>('/api/student/fees', signal) });
export const useOverview = (enabled = true) => useQuery({ queryKey: qk.overview, queryFn: ({ signal }) => api.get<Overview>('/api/teacher/overview', signal), enabled });
export const useStudents = () => useQuery({ queryKey: qk.students, queryFn: ({ signal }) => api.get<StudentSummary[]>('/api/teacher/students', signal) });
export const useStudent = (id: string) => useQuery({ queryKey: qk.student(id), queryFn: ({ signal }) => api.get<StudentDetail>(`/api/teacher/students/${id}`, signal) });
export const useRequests = () => useQuery({ queryKey: qk.requests, queryFn: ({ signal }) => api.get<Requests>('/api/teacher/requests', signal) });
export const usePayments = (status: PaymentStatus | 'All') =>
  useQuery({ queryKey: qk.payments(status), queryFn: ({ signal }) => api.get<Payment[]>(`/api/teacher/payments?status=${status}`, signal) });
export const useConsults = () => useQuery({ queryKey: qk.consults, queryFn: ({ signal }) => api.get<Consult[]>('/api/teacher/consults', signal) });

// ---------- helpers for optimistic updates (#2) ----------
type Snapshot = [readonly unknown[], unknown][];
async function snapshot(qc: QueryClient, ...keys: (readonly unknown[])[]): Promise<Snapshot> {
  await Promise.all(keys.map((k) => qc.cancelQueries({ queryKey: k })));
  return keys.flatMap((k) => qc.getQueriesData({ queryKey: k }));
}
function restore(qc: QueryClient, snap: Snapshot | undefined) {
  snap?.forEach(([k, v]) => qc.setQueryData(k, v));
}
const bumpCount = (qc: QueryClient, key: keyof Overview['counts'], d: number) =>
  qc.setQueryData<Overview>(qk.overview, (o) => (o ? { ...o, counts: { ...o.counts, [key]: Math.max(0, o.counts[key] + d) } } : o));

// ---------- student mutations ----------

/** Booking is NOT optimistic: it uses a credit and the slot can be taken, so we wait for the server. */
export function useBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { date: string; time: string; key: string }) =>
      api.post<BookResult>('/api/student/lessons', { date: v.date, time: v.time }, { idempotencyKey: v.key }),
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: qk.me });
      qc.invalidateQueries({ queryKey: ['lessons'] });
      qc.invalidateQueries({ queryKey: qk.slots(v.date) });
      qc.invalidateQueries({ queryKey: ['days'] });
    },
  });
}

/** Cancel waits for the server too: the refund depends on the server clock (24 h rule). */
export function useCancelLesson() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.me });
    qc.invalidateQueries({ queryKey: ['lessons'] });
    qc.invalidateQueries({ queryKey: ['slots'] });
  };
  const cancel = useMutation({ mutationFn: (id: string) => api.post<CancelResult>(`/api/student/lessons/${id}/cancel`), onSettled: invalidate });
  const undo = (id: string) => api.post<void>(`/api/student/lessons/${id}/undo-cancel`).finally(invalidate);
  return { cancel, undo };
}

export function useAskMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { lessonId: string; date: string; time: string; reason: string }) =>
      api.post(`/api/student/lessons/${v.lessonId}/change-requests`, { date: v.date, time: v.time, reason: v.reason }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['lessons'] }),
  });
}

export function useWithdrawMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changeId: string) => api.post(`/api/student/change-requests/${changeId}/withdraw`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['lessons'] }),
  });
}

/** Optimistic: marking read is harmless, and undo puts the exact previous state back. */
export function useMarkAllRead() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (_ids: string[]) => api.post('/api/student/alerts/read', { ids: _ids, read: true }),
    onMutate: async (ids) => {
      const snap = await snapshot(qc, qk.alerts, qk.me);
      qc.setQueryData<AlertItem[]>(qk.alerts, (a) => a?.map((x) => (ids.includes(x.id) ? { ...x, read: true } : x)));
      qc.setQueryData<Me | null>(qk.me, (me) => (me ? { ...me, unreadAlerts: 0 } : me));
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.alerts }); qc.invalidateQueries({ queryKey: qk.me }); },
  });
  const undo = async (ids: string[]) => {
    qc.setQueryData<AlertItem[]>(qk.alerts, (a) => a?.map((x) => (ids.includes(x.id) ? { ...x, read: false } : x)));
    await api.post('/api/student/alerts/read', { ids, read: false });
    qc.invalidateQueries({ queryKey: qk.alerts });
    qc.invalidateQueries({ queryKey: qk.me });
  };
  return { mutation: m, undo };
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Partial<Me>) => api.put<Me>('/api/student/profile', v),
    onMutate: async (v) => {
      const snap = await snapshot(qc, qk.me);
      qc.setQueryData<Me | null>(qk.me, (me) => (me ? { ...me, ...v } : me));
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useUploadReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { form: FormData; key: string }) => api.post<Payment>('/api/student/payments', v.form, { idempotencyKey: v.key }),
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.myPayments }); qc.invalidateQueries({ queryKey: qk.me }); qc.invalidateQueries({ queryKey: qk.myFees }); },
  });
}

export function useSendConsult() {
  return useMutation({
    mutationFn: (v: { name: string; contactType: ConsultContactType; contact: string; preferredTime: ConsultTime; topic: string }) => api.post('/api/public/consults', v),
  });
}

/**
 * 回報 a past lesson. Not optimistic: the server checks the window and that it wasn't reported already,
 * and it's one tap after a confirm dialog, so waiting ~0.5 s is fine. Idempotent so a double tap sends one report.
 */
export function useReportLesson() {
  const qc = useQueryClient();
  const report = useMutation({
    mutationFn: (v: { lessonId: string; reason: string; key: string }) =>
      api.post<Lesson>(`/api/student/lessons/${v.lessonId}/reports`, { reason: v.reason.trim() || null }, { idempotencyKey: v.key }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['lessons'] }),
  });
  const withdraw = useMutation({
    mutationFn: (reportId: string) => api.post(`/api/student/reports/${reportId}/withdraw`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['lessons'] }),
  });
  return { report, withdraw };
}

// ---------- teacher mutations (optimistic + undo) ----------

export function useDecideChange() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (v: { id: string; approve: boolean; message?: string }) =>
      api.post(`/api/teacher/change-requests/${v.id}/${v.approve ? 'approve' : 'decline'}`, { message: v.message ?? null }),
    onMutate: async (v) => {
      const snap = await snapshot(qc, qk.requests, qk.overview);
      qc.setQueryData<Requests>(qk.requests, (r) => (r ? { ...r, changes: r.changes.filter((c) => c.id !== v.id) } : r));
      bumpCount(qc, 'changes', -1);
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.requests }); qc.invalidateQueries({ queryKey: qk.overview }); qc.invalidateQueries({ queryKey: ['lessons'] }); },
  });
  const undo = async (id: string) => {
    await api.post(`/api/teacher/change-requests/${id}/undo`);
    qc.invalidateQueries({ queryKey: qk.requests }); qc.invalidateQueries({ queryKey: qk.overview }); qc.invalidateQueries({ queryKey: ['lessons'] });
  };
  return { mutation: m, undo };
}

/** 回報 審核. Approve gives 1 堂 back and adds the 取消費 (unless waived); decline needs a reason. */
export function useDecideReport() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.requests }); qc.invalidateQueries({ queryKey: qk.overview });
    qc.invalidateQueries({ queryKey: ['lessons'] }); qc.invalidateQueries({ queryKey: qk.students });
  };
  const m = useMutation({
    mutationFn: (v: { id: string; approve: boolean; message?: string; waiveFee?: boolean; key: string }) =>
      api.post(`/api/teacher/reports/${v.id}/${v.approve ? 'approve' : 'decline'}`, { message: v.message ?? null, waiveFee: !!v.waiveFee }, { idempotencyKey: v.key }),
    onMutate: async (v) => {
      const snap = await snapshot(qc, qk.requests, qk.overview);
      qc.setQueryData<Requests>(qk.requests, (r) => (r ? { ...r, reports: r.reports.filter((x) => x.id !== v.id) } : r));
      bumpCount(qc, 'reports', -1);
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
    onSettled: refresh,
  });
  const undo = async (id: string) => { await api.post(`/api/teacher/reports/${id}/undo`).finally(refresh); };
  return { mutation: m, undo };
}

export function useDecideApplication() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => api.post(`/api/teacher/applications/${v.id}/${v.approve ? 'approve' : 'decline'}`),
    onMutate: async (v) => {
      const snap = await snapshot(qc, qk.requests, qk.overview);
      qc.setQueryData<Requests>(qk.requests, (r) => (r ? { ...r, applications: r.applications.filter((a) => a.id !== v.id) } : r));
      bumpCount(qc, 'applications', -1);
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.requests }); qc.invalidateQueries({ queryKey: qk.overview }); qc.invalidateQueries({ queryKey: qk.students }); },
  });
  const undo = async (id: string) => {
    await api.post(`/api/teacher/applications/${id}/undo`);
    qc.invalidateQueries({ queryKey: qk.requests }); qc.invalidateQueries({ queryKey: qk.overview }); qc.invalidateQueries({ queryKey: qk.students });
  };
  return { mutation: m, undo };
}

export function useDecidePayment() {
  const qc = useQueryClient();
  const drop = (id: string) => {
    qc.setQueriesData<Payment[]>({ queryKey: ['payments'] }, (list) => list?.filter((p) => !(p.id === id && p.status === 'Pending')));
    bumpCount(qc, 'receipts', -1);
  };
  const m = useMutation({
    mutationFn: (v: { id: string; confirm: boolean; reason?: string; key: string }) =>
      api.post(`/api/teacher/payments/${v.id}/${v.confirm ? 'confirm' : 'reject'}`, { reason: v.reason ?? null }, { idempotencyKey: v.key }),
    // 退回 is optimistic (the sheet closes at once). 確認 is NOT: it adds credits, so the receipt stays open with a
    // spinner until the server has really confirmed it — Iris never sees "done" for money that wasn't booked.
    onMutate: async (v) => {
      if (v.confirm) return { snap: undefined };
      const snap = await snapshot(qc, ['payments'], qk.overview);
      drop(v.id);
      return { snap };
    },
    onSuccess: (_r, v) => { if (v.confirm) drop(v.id); },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restore(qc, ctx.snap); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: qk.overview }); qc.invalidateQueries({ queryKey: qk.students }); },
  });
  const undo = async (id: string) => {
    await api.post(`/api/teacher/payments/${id}/undo`);
    qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: qk.overview }); qc.invalidateQueries({ queryKey: qk.students });
  };
  return { mutation: m, undo };
}

export function useAdjustCredits(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { delta: number; reason: string }) => api.post<{ credits: number }>(`/api/teacher/students/${studentId}/credits`, v),
    onMutate: async ({ delta }) => {
      const snap = await snapshot(qc, qk.student(studentId));
      qc.setQueryData<StudentDetail>(qk.student(studentId), (s) => (s ? { ...s, credits: Math.max(0, s.credits + delta) } : s));
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.student(studentId) }); qc.invalidateQueries({ queryKey: qk.students }); },
  });
}

export function useSetClassType(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (classType: ClassType) => api.patch(`/api/teacher/students/${studentId}/class-type`, { classType }),
    onMutate: async (classType) => {
      const snap = await snapshot(qc, qk.student(studentId), qk.students);
      qc.setQueryData<StudentDetail>(qk.student(studentId), (s) => (s ? { ...s, classType } : s));
      qc.setQueryData<StudentSummary[]>(qk.students, (l) => l?.map((s) => (s.id === studentId ? { ...s, classType } : s)));
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.student(studentId) }); qc.invalidateQueries({ queryKey: qk.students }); },
  });
}

export function useTeacherCancel() {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: ['lessons'] }); qc.invalidateQueries({ queryKey: qk.overview }); qc.invalidateQueries({ queryKey: qk.students }); };
  const cancel = useMutation({ mutationFn: (id: string) => api.post(`/api/teacher/lessons/${id}/cancel`), onSettled: inv });
  const undo = (id: string) => api.post(`/api/teacher/lessons/${id}/undo-cancel`).finally(inv);
  return { cancel, undo };
}

export function useMarkContacted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; contacted: boolean }) => api.post(`/api/teacher/consults/${v.id}/contacted`, { contacted: v.contacted }),
    onMutate: async (v) => {
      const snap = await snapshot(qc, qk.consults, qk.overview);
      qc.setQueryData<Consult[]>(qk.consults, (l) => l?.map((c) => (c.id === v.id ? { ...c, contacted: v.contacted } : c)));
      bumpCount(qc, 'consults', v.contacted ? -1 : 1);
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.consults }); qc.invalidateQueries({ queryKey: qk.overview }); },
  });
}

/** Set while a deliberate logout is happening, so Shell sends the user home instead of to /login. */
export const session = { loggingOut: false };

export function useLogout() {
  const qc = useQueryClient();
  // Callers navigate away FIRST, then call this: clearing the cache while a signed-in page is still mounted
  // would make that page read a user that no longer exists.
  return useMutation({ mutationFn: () => api.post('/api/auth/logout'), onMutate: () => { session.loggingOut = true; busy.start(); }, onSettled: () => { window.setTimeout(() => { session.loggingOut = false; busy.stop(); }, 600); }, onSuccess: () => { qc.setQueryData(qk.me, null); qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' }); } });
}

/* ---------- 可預約時段 (Iris's availability) ---------- */
export const useAvailability = () =>
  useQuery({ queryKey: qk.availability, queryFn: ({ signal }) => api.get<Availability>('/api/teacher/availability', signal) });

/**
 * One mutation shape for every availability edit: show the change at once (optimistic), roll back on error,
 * and afterwards refresh everything that is generated from it — students' days/slots and the lesson length.
 */
function useAvailabilityEdit<V>(send: (v: V) => Promise<Availability>, apply: (a: Availability, v: V) => Availability) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    onMutate: async (v: V) => {
      const snap = await snapshot(qc, qk.availability);
      qc.setQueryData<Availability>(qk.availability, (a) => (a ? apply(a, v) : a));
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
    onSuccess: (a) => qc.setQueryData(qk.availability, a),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['days'] });
      qc.invalidateQueries({ queryKey: ['slots'] });
      qc.invalidateQueries({ queryKey: qk.studio });
    },
  });
}
export const useSaveWeekly = () => useAvailabilityEdit<Availability['weekly']>(
  (w) => api.put<Availability>('/api/teacher/availability/weekly', w), (a, w) => ({ ...a, weekly: w }));
export const useSaveBookingSettings = () => useAvailabilityEdit<BookingSettings>(
  (s) => api.put<Availability>('/api/teacher/availability/settings', s), (a, s) => ({ ...a, settings: s }));
export const useSaveOverride = () => useAvailabilityEdit<DateOverride>(
  (o) => api.put<Availability>(`/api/teacher/availability/overrides/${o.date}`, { closed: o.closed, ranges: o.ranges, note: o.note }),
  (a, o) => ({ ...a, overrides: [...a.overrides.filter((x) => x.date !== o.date), o].sort((x, y) => x.date.localeCompare(y.date)) }));
export const useDeleteOverride = () => useAvailabilityEdit<string>(
  (date) => api.del<Availability>(`/api/teacher/availability/overrides/${date}`),
  (a, date) => ({ ...a, overrides: a.overrides.filter((x) => x.date !== date) }));

/* ---------- 通知學生繳學費 ---------- */
export function useSendReminder(studentId: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (message: string) => api.post<{ id: string; channel: 'line' | 'email' }>(`/api/teacher/students/${studentId}/remind`, { message }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.student(studentId) }),
  });
  /** 復原 within the 10 s alert delay: the queued message is deleted before it is sent. */
  const undo = async (reminderId: string) => {
    await api.del(`/api/teacher/reminders/${reminderId}`);
    qc.invalidateQueries({ queryKey: qk.student(studentId) });
  };
  return { mutation, undo };
}


/** 老師提議改時間 + 收回. Nothing moves until the student accepts, so no optimistic update is needed. */
export function useProposals() {
  const qc = useQueryClient();
  const inv = () => { qc.invalidateQueries({ queryKey: qk.requests }); qc.invalidateQueries({ queryKey: ['lessons'] }); qc.invalidateQueries({ queryKey: ['students'] }); qc.invalidateQueries({ queryKey: qk.overview }); };
  const propose = useMutation({
    mutationFn: (v: { lessonId: string; date: string; time: string; message: string }) =>
      api.post<{ id: string }>(`/api/teacher/lessons/${v.lessonId}/proposals`, { date: v.date, time: v.time, message: v.message }),
    onSettled: inv,
  });
  const withdraw = useMutation({ mutationFn: (id: string) => api.post(`/api/teacher/proposals/${id}/withdraw`), onSettled: inv });
  return { propose, withdraw };
}

/** The student answers Iris's proposal: accept moves the lesson, decline keeps it where it is. */
export function useAnswerProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => api.post(`/api/student/change-requests/${v.id}/${v.accept ? 'accept' : 'decline'}`),
    onSettled: () => { qc.invalidateQueries({ queryKey: ['lessons'] }); qc.invalidateQueries({ queryKey: ['days'] }); },
  });
}

/* ---------- 教師個人資料 ---------- */
export const useTeacherProfile = () => useQuery({ queryKey: qk.teacherProfile, queryFn: () => api.get<TeacherProfile>('/api/teacher/profile') });
/** after any profile change: me (name in the sidebar) + studio (what students see) are stale too */
function useProfileInvalidate() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: qk.teacherProfile }); qc.invalidateQueries({ queryKey: qk.me }); qc.invalidateQueries({ queryKey: qk.studio }); };
}
export function useSaveTeacherProfile() {
  const inv = useProfileInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Pick<TeacherProfile, 'name' | 'lineId' | 'lineIdPublic' | 'status' | 'statusLabel' | 'statusMessage'>) => api.put<TeacherProfile>('/api/teacher/profile', v),
    onSuccess: (r) => qc.setQueryData(qk.teacherProfile, r), // the form compares against this right away
    onSettled: inv,
  });
}
export function useTeacherAvatar() {
  const inv = useProfileInvalidate();
  const upload = useMutation({ mutationFn: (f: File) => { const fd = new FormData(); fd.append('avatar', f); return api.post<{ avatarUrl: string }>('/api/teacher/profile/avatar', fd); }, onSettled: inv });
  const remove = useMutation({ mutationFn: () => api.del('/api/teacher/profile/avatar'), onSettled: inv });
  return { upload, remove };
}
export function useTeacherAccount() {
  const inv = useProfileInvalidate();
  const changeEmail = useMutation({ mutationFn: (v: { email: string; password: string }) => api.put<TeacherProfile>('/api/teacher/account/email', v), onSettled: inv });
  const unlinkLine = useMutation({ mutationFn: () => api.del('/api/teacher/account/line'), onSettled: inv });
  return { changeEmail, unlinkLine };
}

/* ---------- consents & 個資權利申請 ---------- */
export const useMyConsents = () => useQuery({ queryKey: ['my-consents'], queryFn: () => api.get<MyConsents>('/api/me/consents') });
export function useSaveConsents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ConsentInput) => api.post<MyConsents>('/api/me/consents', v),
    onSuccess: (r) => qc.setQueryData(['my-consents'], r),
  });
}
export const useSendPrivacyRequest = () => useMutation({
  mutationFn: (v: { name: string; contact: string; type: PrivacyRequestType; detail: string }) => api.post<{ id: string; dueAt: string }>('/api/public/privacy-requests', v),
});
export const usePrivacyRequests = () => useQuery({ queryKey: ['privacy-requests'], queryFn: () => api.get<PrivacyRequest[]>('/api/teacher/privacy-requests') });
export function useMarkPrivacyDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; note: string }) => api.post<PrivacyRequest>(`/api/teacher/privacy-requests/${v.id}/done`, { note: v.note }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['privacy-requests'] }),
  });
}

/* ---------- 精彩片段 (IG Reels) ---------- */
export const REEL_MAX = 8;
export const useReels = () => useQuery({ queryKey: ['reels'], queryFn: () => api.get<Reel[]>('/api/public/reels'), staleTime: 60_000 });
export const useTeacherReels = () => useQuery({ queryKey: ['teacher-reels'], queryFn: () => api.get<Reel[]>('/api/teacher/reels') });
function useReelInvalidate() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ['teacher-reels'] }); qc.invalidateQueries({ queryKey: ['reels'] }); };
}
/** create (no id) or update; multipart because of the cover image */
export function useSaveReel(id?: string) {
  const inv = useReelInvalidate();
  return useMutation({
    mutationFn: (v: { title: string; url: string; cover?: File | null }) => {
      const fd = new FormData(); fd.append('title', v.title); fd.append('url', v.url); if (v.cover) fd.append('cover', v.cover);
      return id ? api.put<Reel>(`/api/teacher/reels/${id}`, fd) : api.post<Reel>('/api/teacher/reels', fd);
    },
    onSuccess: inv,
  });
}
export function useDeleteReel() {
  const qc = useQueryClient(); const inv = useReelInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/teacher/reels/${id}`),
    onMutate: (id) => { qc.setQueryData<Reel[]>(['teacher-reels'], (l) => l?.filter((r) => r.id !== id).map((r, i) => ({ ...r, sortOrder: i + 1 }))); },
    onSettled: inv,
  });
}
/** drag-to-sort: optimistic, the server answers with the saved order */
export function useReorderReels() {
  const qc = useQueryClient(); const inv = useReelInvalidate();
  return useMutation({
    mutationFn: (ids: string[]) => api.put<Reel[]>('/api/teacher/reels/order', { ids }),
    onMutate: (ids) => {
      const prev = qc.getQueryData<Reel[]>(['teacher-reels']);
      qc.setQueryData<Reel[]>(['teacher-reels'], (l) => l && ids.map((id, i) => ({ ...l.find((r) => r.id === id)!, sortOrder: i + 1 })));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['teacher-reels'], ctx.prev),
    onSettled: inv,
  });
}

/* ---------- 學生列表: 停用 / 啟用, 給筆記 / 給作業 ---------- */
export function useSetStudentDisabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; disabled: boolean }) => api.patch<StudentSummary>(`/api/teacher/students/${v.id}/status`, { disabled: v.disabled }),
    // optimistic: the row greys out right away; rolled back if the server says no
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.students });
      const prev = qc.getQueryData<StudentSummary[]>(qk.students);
      qc.setQueryData<StudentSummary[]>(qk.students, (l) => l?.map((s) => (s.id === v.id ? { ...s, disabled: v.disabled } : s)));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(qk.students, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.students }),
  });
}
export function useAddStudentNote() {
  return useMutation({
    mutationFn: (v: { id: string; kind: 'note' | 'homework'; text: string }) => api.post(`/api/teacher/students/${v.id}/notes`, { kind: v.kind, text: v.text }),
  });
}

/** 聲部 + 程度 are set by Iris (PATCH /api/teacher/students/{id}/basics) */
export function useSaveStudentBasics(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { voiceType: string | null; grade: string | null }) => api.patch(`/api/teacher/students/${id}/basics`, v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.student(id) }); qc.invalidateQueries({ queryKey: qk.students }); },
  });
}

/** 課程 page: 技能徽章 (whole list) and 成長等級 */
export function useSaveSkills(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skills: string[]) => api.put<string[]>(`/api/teacher/students/${id}/skills`, { skills }),
    // optimistic: the badge appears / disappears at once, rolled back if the server says no
    onMutate: async (skills) => {
      await qc.cancelQueries({ queryKey: qk.student(id) });
      const prev = qc.getQueryData<StudentDetail>(qk.student(id));
      if (prev) qc.setQueryData<StudentDetail>(qk.student(id), { ...prev, skills });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(qk.student(id), ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.student(id) }),
  });
}
export function useSaveGrowth(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (level: number) => api.patch(`/api/teacher/students/${id}/growth`, { level }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.student(id) }),
  });
}

/** 個人資料 photo / banner, uploaded by Iris. The server converts to WebP and deletes the old file. */
export function useUploadStudentMedia(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: 'avatar' | 'cover'; file: File }) => {
      const fd = new FormData(); fd.append('file', v.file);
      return api.post<{ url: string }>(`/api/teacher/students/${id}/${v.kind}`, fd);
    },
    onSuccess: (r, v) => {
      qc.setQueryData<StudentDetail>(qk.student(id), (d) => (d ? { ...d, [v.kind === 'avatar' ? 'avatarUrl' : 'coverUrl']: r.url } : d));
      if (v.kind === 'avatar') qc.invalidateQueries({ queryKey: qk.students }); // the list shows the photo too
    },
  });
}

/* ---------- 課堂筆記 (teacher) ---------- */
export const lessonNoteKey = (lessonId: string) => ['lesson-note', lessonId] as const;
/** 404 no_note = "no note yet" → null, not an error */
export function useLessonNote(lessonId: string, enabled = true) {
  return useQuery({
    queryKey: lessonNoteKey(lessonId), enabled,
    queryFn: async ({ signal }) => {
      try { return await api.get<LessonNote>(`/api/teacher/lessons/${lessonId}/note`, signal); }
      catch (e) { if (e instanceof ApiError && e.code === 'no_note') return null; throw e; }
    },
  });
}
/** Replaces the lesson's note (text or image). The server converts the image to WebP and deletes the old file. */
export function useSaveLessonNote(lessonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: 'text'; html: string } | { kind: 'image'; file: File }) => {
      const fd = new FormData();
      fd.append('kind', v.kind);
      if (v.kind === 'text') fd.append('html', v.html); else fd.append('file', v.file);
      return api.put<LessonNote>(`/api/teacher/lessons/${lessonId}/note`, fd);
    },
    onSuccess: (n) => {
      qc.setQueryData(lessonNoteKey(lessonId), n);
      // the 今天的課 icon turns "filled" without waiting for a refetch
      qc.setQueryData<Overview>(qk.overview, (o) => (o ? { ...o, today: o.today.map((l) => (l.id === lessonId ? { ...l, noteKind: n.kind } : l)) } : o));
      // …and in 行事曆 (any month that holds this lesson)
      qc.setQueriesData<Lesson[]>({ queryKey: ['lessons', 'teacher'] }, (ls) => ls?.map((l) => (l.id === lessonId ? { ...l, noteKind: n.kind } : l)));
    },
  });
}
