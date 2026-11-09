import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { qk, useLogout } from '../lib/queries';
import type { Role, StudentSummary } from '../lib/types';
import { Icon, type IconName } from './Icon';

interface Entry { label: string; to?: string; icon: IconName; run?: () => void }

/** ⌘K / Ctrl+K: jump to any page or common action; Iris can also jump to a student from the cached list. */
export function CommandMenu({ open, onClose, role }: { open: boolean; onClose: () => void; role: Role }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const logout = useLogout();

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);
  if (!open) return null;

  const pages: Entry[] = role === 'Teacher'
    ? [
        { label: '首頁', to: '/teacher', icon: 'home' }, { label: '行事曆', to: '/teacher/calendar', icon: 'calendar' },
        { label: '學生', to: '/teacher/students', icon: 'users' }, { label: '申請', to: '/teacher/requests', icon: 'inbox' },
        { label: '付款', to: '/teacher/payments', icon: 'receipt' }, { label: '諮詢', to: '/teacher/consults', icon: 'msg' },
        { label: '可預約時段', to: '/teacher/availability', icon: 'clock' },
      ]
    : [
        { label: '首頁', to: '/app', icon: 'home' }, { label: '預約課程', to: '/app/book', icon: 'book' },
        { label: '行事曆', to: '/app/calendar', icon: 'calendar' }, { label: '堂數與付款', to: '/app/quota', icon: 'receipt' },
        { label: '通知', to: '/app/alerts', icon: 'bell' }, { label: '我的', to: '/app/profile', icon: 'user' },
      ];
  const students = role === 'Teacher' ? (qc.getQueryData<StudentSummary[]>(qk.students) ?? []) : [];
  const go = (e: Entry) => { onClose(); if (e.run) e.run(); else if (e.to) nav(e.to); };
  const logoutEntry: Entry = { label: '登出', icon: 'logout', run: () => { nav('/'); logout.mutate(); } };

  const item = (e: Entry) => (
    <Command.Item key={e.label} value={e.label} onSelect={() => go(e)}><Icon name={e.icon} size={18} />{e.label}</Command.Item>
  );

  return (
    <div className="cmd-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Command className="cmd" label="快速搜尋">
        <Command.Input placeholder="搜尋頁面或學生…" autoFocus />
        <Command.List>
          <Command.Empty><div className="empty">找不到結果</div></Command.Empty>
          <Command.Group heading="前往">{pages.map(item)}</Command.Group>
          {students.length > 0 && (
            <Command.Group heading="學生">
              {students.map((s) => item({ label: s.name, to: `/teacher/students/${s.id}`, icon: 'user' }))}
            </Command.Group>
          )}
          <Command.Group heading="帳號">{item(logoutEntry)}</Command.Group>
        </Command.List>
        <div className="foot">↑↓ 選擇 · Enter 前往 · Esc 關閉</div>
      </Command>
    </div>
  );
}
