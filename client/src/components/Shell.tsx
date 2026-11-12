import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { session, useMe, useOverview } from '../lib/queries';
import { prefetchRoute } from '../lib/prefetch';
import type { Me, Role } from '../lib/types';
import { CommandMenu } from './CommandMenu';
import { Icon, type IconName } from './Icon';
import { PageSkeleton } from './ui';

interface Item { to: string; label: string; icon: IconName; end?: boolean; desktopOnly?: boolean; match?: string[] }

const STUDENT: Item[] = [
  { to: '/app', label: '首頁', icon: 'home', end: true },
  { to: '/app/book', label: '預約', icon: 'book' },
  { to: '/app/calendar', label: '行事曆', icon: 'calendar' },
  { to: '/app/alerts', label: '通知', icon: 'bell' },
  { to: '/app/profile', label: '我的', icon: 'user' },
  { to: '/app/quota', label: '堂數與付款', icon: 'receipt', desktopOnly: true },
];
const TEACHER: Item[] = [
  { to: '/teacher', label: '首頁', icon: 'home', end: true },
  { to: '/teacher/calendar', label: '行事曆', icon: 'calendar' },
  { to: '/teacher/students', label: '學生', icon: 'users' },
  { to: '/teacher/inbox', label: '收件匣', icon: 'inbox', match: ['/teacher/requests', '/teacher/payments', '/teacher/consults'] },
  { to: '/teacher/more', label: '更多', icon: 'more', match: ['/teacher/availability', '/teacher/profile', '/teacher/privacy-requests', '/teacher/reels'] },
];

export const inboxCount = (c?: { changes: number; applications: number; receipts: number; consults: number }) => c ? c.changes + c.applications + c.receipts + c.consults : 0;

const homeOf = (r: Role) => (r === 'Teacher' ? '/teacher' : '/app');
const CurrentUserContext = createContext<Me | null>(null);

export function useCurrentUser() {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error('useCurrentUser must be used within the authenticated Shell.');
  return user;
}

/** Auth guard + navigation: frosted floating bottom bar on phones, frosted sidebar from 900 px. */
export function Shell({ role }: { role: Role }) {
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const me = useMe();
  const overview = useOverview(role === 'Teacher' && me.data?.role === 'Teacher');
  const [cmd, setCmd] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd((v) => !v); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (me.isPending) return <main className="main"><div className="page"><PageSkeleton /></div></main>;
  const u = me.data;
  if (!u) return <Navigate to={session.loggingOut ? '/' : '/login'} replace />;
  if (u.status === 'Pending') return <Navigate to="/pending" replace />;
  if (u.role !== role) return <Navigate to={homeOf(u.role)} replace />;

  const items = role === 'Teacher' ? TEACHER : STUDENT;
  const c = overview.data?.counts;
  const badge = (to: string): number => {
    if (!c) return 0;
    if (to.endsWith('/inbox')) return inboxCount(c);
    if (to.endsWith('/requests')) return c.changes + c.applications;
    if (to.endsWith('/payments')) return c.receipts;
    return 0;
  };
  const dot = (to: string) => (to === '/app/alerts' && u.unreadAlerts > 0) || (to === '/teacher/consults' && (c?.consults ?? 0) > 0);

  const grouped = (it: Item) => it.match?.some((path) => pathname === path || pathname.startsWith(path + '/')) ?? false;
  const link = (it: Item, side: boolean) => (
    <NavLink key={it.to} to={it.to} end={it.end} viewTransition className={({ isActive }) => `item${isActive || grouped(it) ? ' active' : ''}`}
      onPointerEnter={() => prefetchRoute(qc, it.to)} onTouchStart={() => prefetchRoute(qc, it.to)}>
      {({ isActive }) => (
        <>
          <Icon name={it.icon} size={22} weight={isActive || grouped(it) ? 'fill' : 'regular'} />
          <span>{it.label}</span>
          {!side && dot(it.to) && <i className="dot" aria-label="有新的" />}
          {side && badge(it.to) > 0 && <span className="badge" aria-label={`${badge(it.to)} 筆待處理`}>{badge(it.to)}</span>}
          {side && dot(it.to) && <i className="badge" style={{ minWidth: 10, width: 10, height: 10, padding: 0, background: 'var(--bad)' }} aria-label="有新的" />}
        </>
      )}
    </NavLink>
  );

  return (
    <div className="app">
      <aside className="side frosted" aria-label="主選單">
        <div className="brand">Iris Studio</div>
        <button className="search" onClick={() => setCmd(true)} aria-keyshortcuts="Control+K Meta+K"><Icon name="search" size={18} />搜尋<kbd>⌘K</kbd></button>
        <nav className="stack s2" style={{ gap: 4, marginTop: 8 }}>{items.map((i) => link(i, true))}</nav>
        <div className="spacer" />
      </aside>
      <main className="main"><CurrentUserContext.Provider value={u}><Outlet context={{ me: u }} /></CurrentUserContext.Provider></main>
      <nav className="bnav frosted" aria-label="主選單">{items.filter((i) => !i.desktopOnly).map((i) => link(i, false))}</nav>
      <CommandMenu open={cmd} onClose={() => setCmd(false)} role={role} />
    </div>
  );
}
