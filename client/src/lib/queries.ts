import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  AlertItem, BookResult, CancelResult, Consult, Day, Lesson, Me, Overview, Payment, PaymentStatus,
  Requests, Slot, StudentDetail, StudentSummary, StudioInfo,
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
    onSettled: () => { qc.invalidateQueries({ queryKey: qk.myPayments }); qc.invalidateQueries({ queryKey: qk.me }); },
  });
}

export function useSendConsult() {
  return useMutation({
    mutationFn: (v: { name: string; contact: string; preferredDate: string; topic: string }) => api.post('/api/public/consults', v),
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
  return useMutation({
    mutationFn: (delta: number) => api.post<{ credits: number }>(`/api/teacher/students/${studentId}/credits`, { delta }),
    onMutate: async (delta) => {
      const snap = await snapshot(qc, qk.student(studentId));
      qc.setQueryData<StudentDetail>(qk.student(studentId), (s) => (s ? { ...s, credits: Math.max(0, s.credits + delta) } : s));
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

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.post('/api/auth/logout'), onSuccess: () => { qc.clear(); } });
}
