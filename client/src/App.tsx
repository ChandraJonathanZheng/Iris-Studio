import type { RouteObject } from 'react-router';
import { Shell } from './components/Shell';
import { Login, Pending, Register } from './pages/Auth';
import { ConsultPage, Landing } from './pages/Landing';

// Dashboards are split into their own chunks (loaded on demand, and prefetched on hover/touch — see lib/prefetch).
const student = () => import('./pages/student');
const teacher = () => import('./pages/teacher');
const availability = () => import('./pages/availability');
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
  { path: '/pending', Component: Pending },
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
      { path: 'students/:id', lazy: lazy(teacher, 'StudentDetailPage'), children: [{ path: 'remind', lazy: lazy(teacher, 'RemindSheet') }, { path: 'adjust', lazy: lazy(teacher, 'AdjustCreditsSheet') }, { path: 'edit', lazy: lazy(teacher, 'EditStudentSheet') }, { path: 'payments', lazy: lazy(teacher, 'PaymentHistorySheet') }, { path: 'book', lazy: lazy(teacher, 'TeacherBookSheet') }, { path: 'propose/:lessonId', lazy: lazy(teacher, 'ProposeSheet') }] },
      { path: 'requests', lazy: lazy(teacher, 'RequestsPage'), children: [{ path: ':id/decline', lazy: lazy(teacher, 'DeclineSheet') }] },
      { path: 'payments', lazy: lazy(teacher, 'PaymentsPage'), children: [{ path: ':id/reject', lazy: lazy(teacher, 'RejectSheet') }] },
      { path: 'consults', lazy: lazy(teacher, 'ConsultsPage') },
      { path: 'availability', lazy: lazy(availability, 'AvailabilityPage'), children: [{ path: 'range/:weekday/:idx', lazy: lazy(availability, 'RangeSheet') }, { path: 'date/:date', lazy: lazy(availability, 'OverrideSheet') }] },
    ],
  },
  { path: '*', Component: Landing },
];
