import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from './api';
import type {
  AlertItem, Availability, BookingSettings, BookResult, DateOverride, CancelResult, ClassType, Consult, ConsultContactType, ConsultTime, Day, Lesson, Me, NotificationPrefs, Overview, Payment, PaymentStatus,
  Requests, Slot, StudentDetail, StudentSummary, StudioInfo, TeacherProfile, ConsentInput, MyConsents, PrivacyRequest, PrivacyRequestType,
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
};

// ---------- queries ----------
export const useMe = () => useQuery({ queryKey: qk.me, queryFn: ({ signal }) => api.get<Me | null>('/api/me', signal), staleTime: 60_000 });
export const useStudio = () => useQuery({ queryKey: qk.studio, queryFn: () => api.get<StudioInfo>('/api/public/studio'), staleTime: Infinity });
export const useLessons = (scope: 'student' | 'teacher', from: string, to: string) =>
  useQuery({ queryKey: qk.lessons(scope, from, to), queryFn: ({ signal }) => api.get<Lesson[]>(`/api/${scope}/lessons?from=${from}&to=${to}`, signal) });
/** A free slot can be taken at any second, so slot data is always re-checked (staleTime 0). */
export const useDays = (from: string) =>
  useQuery({ queryKey: qk.days(from), queryFn: ({ signal }) => api.get<Day[]>(`/api/slots/days?from=${from}&count=15`, signal), staleTime: 0 });
export const useSlots = (date: string | null) =>
  useQuery({ queryKey: qk.slots(date ?? ''), queryFn: ({ signal }) => api.get<Slot[]>(`/api/slots?date=${date}`, signal), enabled: !!date, staleTime: 0 });
export const useAlerts = () => useQuery({ queryKey: qk.alerts, queryFn: ({ signal }) => api.get<AlertItem[]>('/api/student/alerts', signal) });
export const useMyPayments = () => useQuery({ queryKey: qk.myPayments, queryFn: ({ signal }) => api.get<Payment[]>('/api/student/payments', signal) });
export const useOverview = (enabled = true) => useQuery({ queryKey: qk.overview, queryFn: ({ signal }) => api.get<Overview>('/api/teacher/overview', signal), enabled });
export const useStudents = () => useQuery({ queryKey: qk.students, queryFn: ({ signal }) => api.get<StudentSummary[]>('/api/teacher/students', signal) });
export const useStudent = (id: string, options?: { refetchOnMount?: 'always' }) => useQuery({ queryKey: qk.student(id), queryFn: ({ signal }) => api.get<StudentDetail>(`/api/teacher/students/${id}`, signal), ...options });
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

/** Email preferences (both roles). Optimistic: the switch moves at once and snaps back on error. */
export function useSaveNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: NotificationPrefs) => api.put<NotificationPrefs>('/api/me/notifications', v),
    onMutate: async (v) => {
      const snap = await snapshot(qc, qk.me);
      qc.setQueryData<Me | null>(qk.me, (me) => (me ? { ...me, ...v } : me));
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export const useResendVerification = () => useMutation({ mutationFn: () => api.post('/api/me/email/verification') });
export const useResendConsultConfirmation = () => useMutation({
  mutationFn: (id: string) => api.post(`/api/teacher/consults/${id}/confirmation`),
});

export function useScheduleConsult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; date: string; time: string; note: string }) =>
      api.post<Consult>(`/api/teacher/consults/${v.id}/schedule`, { date: v.date, time: v.time, note: v.note }),
    onSuccess: (c) => {
      qc.setQueryData<Consult[]>(qk.consults, (l) => l?.map((x) => (x.id === c.id ? c : x)));
      qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
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
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.myPayments }); qc.invalidateQueries({ queryKey: qk.me }); },
  });
}

export function useSendConsult() {
  return useMutation({
    mutationFn: (v: { name: string; contactType: ConsultContactType; contact: string; preferredTime: ConsultTime; topic: string }) => api.post('/api/public/consults', v),
  });
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
  const m = useMutation({
    mutationFn: (v: { id: string; confirm: boolean; reason?: string; key: string }) =>
      api.post(`/api/teacher/payments/${v.id}/${v.confirm ? 'confirm' : 'reject'}`, { reason: v.reason ?? null }, { idempotencyKey: v.key }),
    onMutate: async (v) => {
      const snap = await snapshot(qc, ['payments'], qk.overview);
      qc.setQueriesData<Payment[]>({ queryKey: ['payments'] }, (list) => list?.filter((p) => !(p.id === v.id && p.status === 'Pending')));
      bumpCount(qc, 'receipts', -1);
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
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
  const mutation = useMutation({
    mutationFn: (v: { delta: number; reason: string }) => api.post<{ credits: number; id: string; undoUntil: string }>(`/api/teacher/students/${studentId}/credits`, v, { idempotencyKey: newIdempotencyKey() }),
    // Credits stay server-authoritative: optimistic changes would apply the delta twice in an open preview.
    onMutate: () => qc.cancelQueries({ queryKey: qk.student(studentId) }),
    onSuccess: ({ credits }) => {
      qc.setQueryData<StudentDetail>(qk.student(studentId), (s) => (s ? { ...s, credits } : s));
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.student(studentId) }); qc.invalidateQueries({ queryKey: qk.students }); },
  });
  const undo = async (adjustmentId: string) => {
    await api.post(`/api/teacher/credit-adjustments/${adjustmentId}/undo`);
    qc.invalidateQueries({ queryKey: qk.student(studentId) });
    qc.invalidateQueries({ queryKey: qk.students });
  };
  return { ...mutation, undo };
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

export function useSetConsultationCompleted(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (consultationCompleted: boolean) => api.patch(`/api/teacher/students/${studentId}/consultation`, { consultationCompleted }),
    onMutate: async (consultationCompleted) => {
      const snap = await snapshot(qc, qk.student(studentId));
      qc.setQueryData<StudentDetail>(qk.student(studentId), (s) => (s ? { ...s, consultationCompleted } : s));
      return { snap };
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snap),
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: qk.student(studentId) }),
      qc.invalidateQueries({ queryKey: qk.me }),
    ]),
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
  return useMutation({ mutationFn: () => api.post('/api/auth/logout'), onMutate: () => { session.loggingOut = true; }, onSettled: () => { window.setTimeout(() => { session.loggingOut = false; }, 1000); }, onSuccess: () => { qc.setQueryData(qk.me, null); qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' }); } });
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
    mutationFn: (message: string) => api.post<{ id: string; channel: 'line' | 'email' | 'both' }>(`/api/teacher/students/${studentId}/remind`, { message }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.student(studentId) }),
  });
  /** 復原 within the 10 s alert delay: the queued message is deleted before it is sent. */
  const undo = async (reminderId: string) => {
    await api.del(`/api/teacher/reminders/${reminderId}`);
    qc.invalidateQueries({ queryKey: qk.student(studentId) });
  };
  return { mutation, undo };
}

/** Iris books a lesson for a student. Idempotent (double tap = one lesson), uses one of the student's 堂數. */
export function useTeacherBook(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { date: string; time: string; key: string }) =>
      api.post<{ id: string }>(`/api/teacher/lessons?studentId=${encodeURIComponent(studentId)}`, { date: v.date, time: v.time }, { idempotencyKey: v.key }),
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: qk.student(studentId) });
      qc.invalidateQueries({ queryKey: qk.students });
      qc.invalidateQueries({ queryKey: qk.overview });
      qc.invalidateQueries({ queryKey: ['lessons'] });
      qc.invalidateQueries({ queryKey: qk.slots(v.date) });
      qc.invalidateQueries({ queryKey: ['days'] });
    },
  });
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
