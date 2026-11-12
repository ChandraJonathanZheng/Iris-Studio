import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, type LinkProps } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { session, useLogout, useMe, useOverview } from '../lib/queries';
import { prefetchRoute } from '../lib/prefetch';
import { initialOf } from '../lib/date';
import type { Me, Overview, Role } from '../lib/types';
import { CommandMenu, SHORTCUT_KEY } from './CommandMenu';
import { Icon, type IconName } from './Icon';
import { IrisLogo } from './IrisLogo';
import { PageSkeleton } from './ui';

interface Item {
  to: string; label: string; short: string; icon: IconName; end?: boolean;
  /** count badge; with `dot` only an unread dot is shown */
  badge?: number; dot?: boolean;
  /** sidebar only — on phones it lives behind 更多 */
  sideOnly?: boolean;
  /** other paths that belong to this tab */
  match?: string[];
}

/** What Iris must act on: one number for the 收件匣 tab. */
export const inboxCount = (c?: Overview['counts']) =>
  c ? c.changes + (c.reports ?? 0) + c.applications + c.receipts + c.consults : 0;

function useItems(role: Role, unread: number): Item[] {
  const overview = useOverview(role === 'Teacher');
  if (role === 'Student') {
    return [
      { to: '/app', label: '首頁', short: '首頁', icon: 'home', end: true },
      { to: '/app/book', label: '預約課程', short: '預約', icon: 'book' },
      { to: '/app/calendar', label: '行事曆', short: '行事曆', icon: 'calendar' },
      { to: '/app/alerts', label: '通知', short: '通知', icon: 'bell', badge: unread, dot: true, sideOnly: true },
      { to: '/app/profile', label: '個人資料', short: '我的', icon: 'user', sideOnly: true },
    ];
  }
  return [
    { to: '/teacher', label: '首頁', short: '首頁', icon: 'home', end: true },
    { to: '/teacher/calendar', label: '行事曆', short: '行事曆', icon: 'calendar' },
    { to: '/teacher/students', label: '學生', short: '學生', icon: 'users' },
    { to: '/teacher/inbox', label: '收件匣', short: '收件匣', icon: 'inbox', badge: inboxCount(overview.data?.counts), match: ['/teacher/requests', '/teacher/payments', '/teacher/consults'] },
    { to: '/teacher/more', label: '更多', short: '更多', icon: 'more', match: ['/teacher/availability', '/teacher/profile', '/teacher/privacy-requests', '/teacher/reels'] },
  ];
}

/** NavLink, except tabs with `match` are also active on their sub-pages. */
function NavItem({ item, children, ...rest }: { item: Item; children: (active: boolean) => ReactNode } & Omit<LinkProps, 'to' | 'children'>) {
  const { pathname } = useLocation();
  if (!item.match) return <NavLink to={item.to} end={item.end} viewTransition {...rest}>{({ isActive }) => children(isActive)}</NavLink>;
  const active = [item.to, ...item.match].some((p) => pathname === p || pathname.startsWith(p + '/'));
  return <Link to={item.to} viewTransition aria-current={active ? 'page' : undefined} className={active ? 'active' : undefined} {...rest}>{children(active)}</Link>;
}

const CurrentUserContext = createContext<Me | null>(null);
export function useCurrentUser() {
  const me = useContext(CurrentUserContext);
  if (!me) throw new Error('useCurrentUser must be used inside <Shell>');
  return me;
}

/** Auth guard + navigation: floating bottom bar on phones, sidebar from 900 px. */
export function Shell({ role }: { role: Role }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <div className="main"><PageSkeleton /></div>;
  if (!me.data) return session.loggingOut ? <Navigate to="/" replace /> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.data.role !== role) return <Navigate to={me.data.role === 'Teacher' ? '/teacher' : '/app'} replace />;
  if (role === 'Student' && me.data.status === 'Pending') return <Navigate to="/pending" replace />;
  return (
    <CurrentUserContext.Provider value={me.data}>
      <Frame role={role} name={me.data.name} unread={me.data.unreadAlerts}><Outlet /></Frame>
    </CurrentUserContext.Provider>
  );
}

function Frame({ role, name, unread, children }: { role: Role; name: string; unread: number; children: ReactNode }) {
  const qc = useQueryClient();
  const items = useItems(role, unread);
  const [searchOpen, setSearchOpen] = useState(false);
  const logout = useLogout();
  const navigate = useNavigate();
  const warm = (to: string) => () => prefetchRoute(qc, to);
  const signOut = () => { navigate('/'); logout.mutate(); };

  return (
    <div className="app">
      <aside className="side" aria-label="側邊選單">
        <Link to={role === 'Teacher' ? '/teacher' : '/app'} className="logo" aria-label="Iris Vocal Studio">
          <IrisLogo />
          <span className="overline">{role === 'Teacher' ? 'Studio' : '我的課程'}</span>
        </Link>
        <button className="kbd-hint" onClick={() => setSearchOpen(true)} aria-keyshortcuts="Meta+K Control+K">
          <span className="row g2"><Icon name="search" size={16} />快速搜尋</span>
          <span><kbd>{SHORTCUT_KEY}</kbd><kbd>K</kbd></span>
        </button>
        <nav aria-label="主選單">
          {items.map((it) => (
            <NavItem key={it.to} item={it} onMouseEnter={warm(it.to)} onFocus={warm(it.to)}>
              {(active) => (
                <>
                  <Icon name={it.icon} weight={active ? 'fill' : 'regular'} />
                  {it.label}
                  {!!it.badge && (it.dot
                    ? <><span className="badge dot" aria-hidden="true" /><span className="sr-only">，有未讀</span></>
                    : <span className="badge">{it.badge}</span>)}
                </>
              )}
            </NavItem>
          ))}
        </nav>
        <div className="stack g2" style={{ marginTop: 'auto' }}>
          <hr className="line" />
          <div className="row">
            <span className="avatar">{initialOf(name)}</span>
            <span className="grow t">{name}</span>
            <button className="icon-btn flat" aria-label="登出" onClick={signOut}><Icon name="logout" /></button>
          </div>
        </div>
      </aside>

      <main className="main" id="main">{children}</main>

      <nav className="bnav" aria-label="主選單">
        {items.filter((it) => !it.sideOnly).slice(0, 5).map((it) => (
          <NavItem key={it.to} item={it} onTouchStart={warm(it.to)} onMouseEnter={warm(it.to)}>
            {(active) => (
              <>
                <Icon name={it.icon} size={22} weight={active ? 'fill' : 'regular'} />
                <span>{it.short}</span>
                {!!it.badge && (it.dot
                  ? <span className="badge" aria-hidden="true" />
                  : <span className="badge count" aria-hidden="true">{it.badge > 99 ? '99+' : it.badge}</span>)}
                {!!it.badge && <span className="sr-only">，{it.badge} 則待處理</span>}
              </>
            )}
          </NavItem>
        ))}
        {role === 'Student' && <StudentMore onLogout={signOut} />}
      </nav>
      <CommandMenu role={role} open={searchOpen} setOpen={setSearchOpen} />
    </div>
  );
}

/** Phone tab 更多: 個人資料 · 設定 · 登出 in a small pop-up menu. */
function StudentMore({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.hash]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      ref.current?.querySelector<HTMLButtonElement>('.bn-more-btn')?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
  }, [open]);
  const onProfile = location.pathname.startsWith('/app/profile');
  return (
    <div className="bn-more" ref={ref}>
      <button type="button" className={`bn-more-btn${onProfile ? ' active' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-controls="bn-more-menu" onClick={() => setOpen((o) => !o)}>
        <Icon name="more" size={22} weight={open || onProfile ? 'bold' : 'regular'} />
        <span>更多</span>
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
