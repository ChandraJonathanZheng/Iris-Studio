import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import { addDays, studioToday } from './date';
import { qk } from './queries';

/**
 * #7 For private pages we can't pre-render (the HTML is different per user), so we do the next best thing:
 * when a finger touches or a mouse hovers a nav item, we start loading that page's code and data.
 * By the time the click lands, both are usually ready.
 */
const pages = {
  student: () => import('../pages/student'),
  teacher: () => import('../pages/teacher'),
};

export function monthRange(): [string, string] {
  const t = studioToday();
  return [addDays(t, -45), addDays(t, 75)];
}

export function prefetchRoute(qc: QueryClient, to: string) {
  const [from, until] = monthRange();
  const t = studioToday();
  const pf = (key: readonly unknown[], url: string) => qc.prefetchQuery({ queryKey: key, queryFn: () => api.get(url), staleTime: 30_000 });
  if (to.startsWith('/app')) {
    void pages.student();
    if (to === '/app/book') pf(qk.days(t), `/api/slots/days?from=${addDays(t, -1)}&count=15`);
    if (to === '/app/calendar' || to === '/app') pf(qk.lessons('student', from, until), `/api/student/lessons?from=${from}&to=${until}`);
    if (to === '/app/alerts') pf(qk.alerts, '/api/student/alerts');
    if (to === '/app/quota') pf(qk.myPayments, '/api/student/payments');
  } else if (to.startsWith('/teacher')) {
    void pages.teacher();
    if (to === '/teacher') pf(qk.overview, '/api/teacher/overview');
    if (to === '/teacher/calendar') pf(qk.lessons('teacher', from, until), `/api/teacher/lessons?from=${from}&to=${until}`);
    if (to === '/teacher/students') pf(qk.students, '/api/teacher/students');
    if (to === '/teacher/requests') pf(qk.requests, '/api/teacher/requests');
    if (to === '/teacher/payments') pf(qk.payments('Pending'), '/api/teacher/payments?status=Pending');
    if (to === '/teacher/consults') pf(qk.consults, '/api/teacher/consults');
  }
}
