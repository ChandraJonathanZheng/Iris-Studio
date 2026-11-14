import type { RouteObject } from 'react-router';
import { Shell } from './components/Shell';
import { Login, Pending, Register, ForgotPassword, ResetPassword } from './pages/Auth';
import { ConsultPage, Landing } from './pages/Landing';

// Dashboards are split into their own chunks (loaded on demand, and prefetched on hover/touch — see lib/prefetch).
const student = () => import('./pages/student');
const teacher = () => import('./pages/teacher');
const availability = () => import('./pages/availability');
const reels = () => import('./pages/reels');
const lazy = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/**
 * Every screen AND every sheet has its own URL (#12): e.g. /app/book/confirm.
 * That's what makes back buttons and back gestures close a sheet instead of leaving the app.
 */
export const routes: RouteObject[] = [
  { path: '/', Component: Landing },
  { path: '/consult', Component: ConsultPage },
  { path: '/login', Component: Login },
  { path: '/register', Component: Register },
  { path: '/forgot-password', Component: ForgotPassword },
  { path: '/reset-password', Component: ResetPassword },
  { path: '/pending', Component: Pending },
  // legal & privacy documents (+ cookie settings, 個資權利申請) — public, their own chunk
  { path: '/legal/:slug', lazy: async () => ({ Component: (await import('./pages/Legal')).LegalPage }) },
  {
    path: '/app', element: <Shell role="Student" />,
    children: [
      { index: true, lazy: lazy(student, 'StudentHome') },
      { path: 'lessons/:id/cancel', lazy: lazy(student, 'StudentHome'), children: [{ index: true, lazy: lazy(student, 'CancelSheet') }] },
      { path: 'lessons/:id/move', lazy: lazy(student, 'Move') },
      { path: 'book', lazy: lazy(student, 'Book'), children: [{ path: 'confirm', lazy: lazy(student, 'BookConfirm') }] },
      { path: 'calendar', lazy: lazy(student, 'StudentCalendar') },
      { path: 'quota', lazy: lazy(student, 'QuotaPage') },
      { path: 'alerts', lazy: lazy(student, 'Alerts') },
      { path: 'profile', lazy: lazy(student, 'Profile') },
    ],
  },
  {
    path: '/teacher', element: <Shell role="Teacher" />,
    children: [
      { index: true, lazy: lazy(teacher, 'TeacherHome') },
      { path: 'calendar', lazy: lazy(teacher, 'TeacherCalendar'), children: [{ path: 'lessons/:id/cancel', lazy: lazy(teacher, 'TeacherCancelSheet') }] },
      { path: 'students', lazy: lazy(teacher, 'Students') },
      { path: 'students/:id/lessons', lazy: lazy(teacher, 'StudentLessonsPage'), children: [{ path: 'adjust', lazy: lazy(teacher, 'AdjustCreditsSheet') }, { path: 'propose/:lessonId', lazy: lazy(teacher, 'ProposeSheet') }, { path: 'history', lazy: lazy(teacher, 'LessonHistorySheet') }] },
      { path: 'students/:id', lazy: lazy(teacher, 'StudentDetailPage'), children: [{ path: 'remind', lazy: lazy(teacher, 'RemindSheet') }, { path: 'adjust', lazy: lazy(teacher, 'AdjustCreditsSheet') }, { path: 'edit', lazy: lazy(teacher, 'EditStudentSheet') }, { path: 'basics', lazy: lazy(teacher, 'EditBasicsSheet') }, { path: 'payments', lazy: lazy(teacher, 'PaymentHistorySheet') }, { path: 'propose/:lessonId', lazy: lazy(teacher, 'ProposeSheet') }] },
      { path: 'requests', lazy: lazy(teacher, 'RequestsPage'), children: [{ path: ':id/decline', lazy: lazy(teacher, 'DeclineSheet') }, { path: 'reports/:id/decline', lazy: lazy(teacher, 'ReportDeclineSheet') }] },
      { path: 'payments', lazy: lazy(teacher, 'PaymentsPage'), children: [{ path: ':id/reject', lazy: lazy(teacher, 'RejectSheet') }] },
      { path: 'consults', lazy: lazy(teacher, 'ConsultsPage') },
      { path: 'inbox', lazy: lazy(teacher, 'InboxIndex') },
      { path: 'profile', lazy: lazy(teacher, 'TeacherProfilePage') },
      { path: 'privacy-requests', lazy: lazy(teacher, 'PrivacyRequestsPage') },
      { path: 'more', lazy: lazy(teacher, 'TeacherMore'), children: [{ path: 'packages', lazy: lazy(teacher, 'PackagesSheet') }] },
      { path: 'more/reels', lazy: lazy(reels, 'ReelsAdmin') },
      { path: 'more/reels/new', lazy: lazy(reels, 'ReelEditPage') },
      { path: 'more/reels/:id', lazy: lazy(reels, 'ReelEditPage') },
      { path: 'availability', lazy: lazy(availability, 'AvailabilityPage'), children: [{ path: 'range/:weekday/:idx', lazy: lazy(availability, 'RangeSheet') }, { path: 'date/:date', lazy: lazy(availability, 'OverrideSheet') }] },
    ],
  },
  { path: '*', Component: Landing },
];
