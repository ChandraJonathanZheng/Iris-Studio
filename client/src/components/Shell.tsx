import { useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useLogout, useMe, useOverview } from '../lib/queries';
import { prefetchRoute } from '../lib/prefetch';
import { initialOf } from '../lib/date';
import type { Role } from '../lib/types';
import { CommandMenu, modKey } from './CommandMenu';
import { Icon } from './Icon';
import { PageSkeleton } from './ui';

interface NavItem { to: string; label: string; short: string; icon: string; badge?: number; end?: boolean }

function useNavItems(role: Role, unread: number): NavItem[] {
  const ov = useOverview(role === 'Teacher');
  if (role === 'Student') return [
    { to: '/app', label: '首頁', short: '首頁', icon: 'home', end: true },
    { to: '/app/book', label: '預約課程', short: '預約', icon: 'book' },
    { to: '/app/calendar', label: '行事曆', short: '行事曆', icon: 'calendar' },
    { to: '/app/alerts', label: '通知', short: '通知', icon: 'bell', badge: unread },
    { to: '/app/profile', label: '個人資料', short: '我的', icon: 'user' },
  ];
  const c = ov.data?.counts;
  return [
    { to: '/teacher', label: '首頁', short: '首頁', icon: 'home', end: true },
    { to: '/teacher/calendar', label: '行事曆', short: '行事曆', icon: 'calendar' },
    { to: '/teacher/students', label: '學生', short: '學生', icon: 'users' },
    { to: '/teacher/requests', label: '申請', short: '申請', icon: 'inbox', badge: c ? c.changes + c.applications : 0 },
    { to: '/teacher/payments', label: '付款', short: '付款', icon: 'receipt', badge: c?.receipts },
    { to: '/teacher/consults', label: '諮詢', short: '諮詢', icon: 'msg', badge: c?.consults },
  ];
}

/** Role-guarded app frame: floating sidebar on desktop, floating bottom nav on phones (Guidebook §3, §4.9). */
export function Shell({ role }: { role: Role }) {
  const me = useMe();
  const loc = useLocation();
  if (me.isPending) return <div className="main"><PageSkeleton /></div>;
  if (!me.data) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (me.data.role !== role) return <Navigate to={me.data.role === 'Teacher' ? '/teacher' : '/app'} replace />;
  if (role === 'Student' && me.data.status === 'Pending') return <Navigate to="/pending" replace />;
  return <Frame role={role} name={me.data.name} unread={me.data.unreadAlerts}><Outlet /></Frame>;
}

function Frame({ role, name, unread, children }: { role: Role; name: string; unread: number; children: ReactNode }) {
  const qc = useQueryClient();
  const items = useNavItems(role, unread);
  const [cmd, setCmd] = useState(false);
  const logout = useLogout();
  const nav = useNavigate();
  const intent = (to: string) => () => prefetchRoute(qc, to);

  return (
    <div className="app">
      <aside className="side" aria-label="側邊選單">
        <Link to={role === 'Teacher' ? '/teacher' : '/app'} className="logo"><b>IRIS</b><span className="overline">{role === 'Teacher' ? 'Studio' : '我的課程'}</span></Link>
        <button className="kbd-hint" onClick={() => setCmd(true)} aria-keyshortcuts="Meta+K Control+K">
          <span className="row g2"><Icon name="search" size={16} />快速搜尋</span><span><kbd>{modKey}</kbd><kbd>K</kbd></span>
        </button>
        <nav aria-label="主選單">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} viewTransition onMouseEnter={intent(i.to)} onFocus={intent(i.to)}>
              <Icon name={i.icon} />{i.label}{!!i.badge && <span className="badge">{i.badge}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="stack g2" style={{ marginTop: 'auto' }}>
          <hr className="line" />
          <div className="row"><span className="avatar">{initialOf(name)}</span><span className="grow t">{name}</span>
            <button className="icon-btn flat" aria-label="登出" onClick={() => logout.mutate(undefined, { onSuccess: () => nav('/') })}><Icon name="logout" /></button>
          </div>
        </div>
      </aside>

      <main className="main" id="main">{children}</main>

      <nav className="bnav" aria-label="主選單">
        {items.slice(0, role === 'Student' ? 5 : 6).map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} viewTransition onTouchStart={intent(i.to)} onMouseEnter={intent(i.to)}>
            <Icon name={i.icon} size={22} /><span>{i.short}</span>
            {!!i.badge && <span className="badge" aria-hidden="true" />}
            {!!i.badge && <span className="sr-only">，{i.badge} 則待處理</span>}
          </NavLink>
        ))}
      </nav>

      <CommandMenu role={role} open={cmd} setOpen={setCmd} />
    </div>
  );
}
