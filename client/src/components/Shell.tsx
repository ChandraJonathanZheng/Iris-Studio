import { Logo } from './Logo';
import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { session, useLogout, useMe, useOverview } from '../lib/queries';
import { prefetchRoute } from '../lib/prefetch';
import { initialOf } from '../lib/date';
import type { Me, Role } from '../lib/types';

/**
 * The signed-in user, provided by Shell AFTER it has checked "logged in + right role + active".
 * Pages read it from here (not straight from the query cache), so they re-render only together with Shell.
 * When the user logs out, Shell swaps to a redirect and the page unmounts; it can never see a null user.
 */
const MeContext = createContext<Me | null>(null);
export function useCurrentUser(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useCurrentUser must be used inside <Shell>');
  return me;
}
import { CommandMenu, modKey } from './CommandMenu';
import { Icon } from './Icon';
import { PageSkeleton } from './ui';

/** dot: show an unread dot instead of a number (when the count itself doesn't matter, e.g. a student's 通知). */
interface NavItem {
  to: string; label: string; short: string; icon: string; badge?: number; dot?: boolean; end?: boolean;
  /** sidebar only (the phone bar has no room) */ sideOnly?: boolean;
  /** the tab is "here" on any of these paths too — 收件匣 groups 申請 / 付款 / 諮詢, 更多 groups its pages */ match?: string[];
}

function useNavItems(role: Role, unread: number): NavItem[] {
  const ov = useOverview(role === 'Teacher');
  if (role === 'Student') return [
    { to: '/app', label: '首頁', short: '首頁', icon: 'home', end: true },
    { to: '/app/book', label: '預約課程', short: '預約', icon: 'book' },
    { to: '/app/calendar', label: '行事曆', short: '行事曆', icon: 'calendar' },
    { to: '/app/alerts', label: '通知', short: '通知', icon: 'bell', badge: unread, dot: true, sideOnly: true }, // bottom bar: the bell already sits top-right on 首頁
    { to: '/app/profile', label: '個人資料', short: '我的', icon: 'user', sideOnly: true }, // phone bar: inside the ⋯ menu
  ];
  const c = ov.data?.counts;
  // 5 tabs (was 6): everything that waits for Iris's decision lives in one 收件匣 with ONE badge,
  // so she checks one place instead of three; rarely used pages move to 更多.
  return [
    { to: '/teacher', label: '首頁', short: '首頁', icon: 'home', end: true },
    { to: '/teacher/calendar', label: '行事曆', short: '行事曆', icon: 'calendar' },
    { to: '/teacher/students', label: '學生', short: '學生', icon: 'users' },
    { to: '/teacher/inbox', label: '收件匣', short: '收件匣', icon: 'inbox', badge: inboxCount(c), match: ['/teacher/requests', '/teacher/payments', '/teacher/consults'] },
    { to: '/teacher/more', label: '更多', short: '更多', icon: 'more', match: ['/teacher/availability', '/teacher/profile', '/teacher/privacy-requests'] },
  ];
}

/** items that need Iris to act: open 改時間 + 回報 + new students + receipts to check + consults not contacted yet */
export const inboxCount = (c?: { changes: number; reports?: number; applications: number; receipts: number; consults: number }) =>
  c ? c.changes + (c.reports ?? 0) + c.applications + c.receipts + c.consults : 0;

/** NavLink only knows its own path; grouped tabs (收件匣, 更多) are also "here" on their member pages */
function NavItemLink({ i, size, children, ...rest }: { i: NavItem; size?: number; children: (active: boolean) => ReactNode } & Omit<ComponentProps<typeof Link>, 'to' | 'children'>) {
  const { pathname } = useLocation();
  if (!i.match) return <NavLink to={i.to} end={i.end} viewTransition {...rest}>{({ isActive }) => children(isActive)}</NavLink>;
  const active = [i.to, ...i.match].some((p) => pathname === p || pathname.startsWith(p + '/'));
  return <Link to={i.to} viewTransition aria-current={active ? 'page' : undefined} className={active ? 'active' : undefined} {...rest}>{children(active)}</Link>;
}

/** Role-guarded app frame: floating sidebar on desktop, floating bottom nav on phones (Guidebook §3, §4.9). */
export function Shell({ role }: { role: Role }) {
  const me = useMe();
  const loc = useLocation();
  if (me.isPending) return <div className="main"><PageSkeleton /></div>;
  if (!me.data) {
    if (session.loggingOut) return <Navigate to="/" replace />; // render stays pure: the flag is reset by useLogout
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  if (me.data.role !== role) return <Navigate to={me.data.role === 'Teacher' ? '/teacher' : '/app'} replace />;
  if (role === 'Student' && me.data.status === 'Pending') return <Navigate to="/pending" replace />;
  return <MeContext.Provider value={me.data}><Frame role={role} name={me.data.name} unread={me.data.unreadAlerts}><Outlet /></Frame></MeContext.Provider>;
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
        <Link to={role === 'Teacher' ? '/teacher' : '/app'} className="logo" aria-label="Iris Vocal Studio"><Logo /><span className="overline">{role === 'Teacher' ? 'Studio' : '我的課程'}</span></Link>
        <button className="kbd-hint" onClick={() => setCmd(true)} aria-keyshortcuts="Meta+K Control+K">
          <span className="row g2"><Icon name="search" size={16} />快速搜尋</span><span><kbd>{modKey}</kbd><kbd>K</kbd></span>
        </button>
        <nav aria-label="主選單">
          {items.map((i) => (
            <NavItemLink key={i.to} i={i} onMouseEnter={intent(i.to)} onFocus={intent(i.to)}>
              {(isActive) => <>
              <Icon name={i.icon} weight={isActive ? 'fill' : 'regular'} />{i.label}{!!i.badge && (i.dot ? <><span className="badge dot" aria-hidden="true" /><span className="sr-only">，有未讀</span></> : <span className="badge">{i.badge}</span>)}
              </>}
            </NavItemLink>
          ))}
        </nav>
        <div className="stack g2" style={{ marginTop: 'auto' }}>
          <hr className="line" />
          <div className="row"><span className="avatar">{initialOf(name)}</span><span className="grow t">{name}</span>
            <button className="icon-btn flat" aria-label="登出" onClick={() => { nav('/'); logout.mutate(); }}><Icon name="logout" /></button>
          </div>
        </div>
      </aside>

      <main className="main" id="main">{children}</main>

      <nav className="bnav" aria-label="主選單">
        {items.filter((i) => !i.sideOnly).slice(0, 5).map((i) => (
          <NavItemLink key={i.to} i={i} onTouchStart={intent(i.to)} onMouseEnter={intent(i.to)}>
            {(isActive) => <>
              {/* active tab = filled icon: a second cue besides the sage background, readable even without colour */}
              <Icon name={i.icon} size={22} weight={isActive ? 'fill' : 'regular'} /><span>{i.short}</span>
              {/* student 通知 = dot (the number doesn't matter); teacher 收件匣 = count (how much work is waiting) */}
              {!!i.badge && (i.dot ? <span className="badge" aria-hidden="true" /> : <span className="badge count" aria-hidden="true">{i.badge > 99 ? '99+' : i.badge}</span>)}
              {!!i.badge && <span className="sr-only">，{i.badge} 則待處理</span>}
            </>}
          </NavItemLink>
        ))}
        {role === 'Student' && <MoreMenu onLogout={() => { nav('/'); logout.mutate(); }} />}
      </nav>

      <CommandMenu role={role} open={cmd} setOpen={setCmd} />
    </div>
  );
}

/** Phone bar ⋯ : a drop-up with 個人資料 / 設定 / 登出. Closes on outside tap, Esc, or picking an item. */
function MoreMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname, loc.hash]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector<HTMLButtonElement>('.bn-more-btn')?.focus(); } };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const active = loc.pathname.startsWith('/app/profile');
  return (
    <div className="bn-more" ref={ref}>
      <button type="button" className={`bn-more-btn${active ? ' active' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-controls="bn-more-menu" onClick={() => setOpen((o) => !o)}>
        <Icon name="more" size={22} weight={open || active ? 'bold' : 'regular'} /><span>更多</span>
      </button>
      {open && (
        <div className="bn-pop" id="bn-more-menu" role="menu" aria-label="更多">
          <Link role="menuitem" to="/app/profile" viewTransition><Icon name="user" size={18} />個人資料</Link>
          <Link role="menuitem" to="/app/profile#settings" viewTransition><Icon name="gear" size={18} />設定</Link>
          <button role="menuitem" type="button" className="danger" onClick={onLogout}><Icon name="logout" size={18} />登出</button>
        </div>
      )}
    </div>
  );
}
