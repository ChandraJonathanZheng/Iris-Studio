import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '../lib/queries';
import type { Role, StudentSummary } from '../lib/types';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = isMac ? '⌘' : 'Ctrl';

const PAGES: Record<Role, { to: string; label: string; keywords?: string[] }[]> = {
  Student: [
    { to: '/app', label: '首頁', keywords: ['home'] },
    { to: '/app/book', label: '預約課程', keywords: ['book'] },
    { to: '/app/calendar', label: '行事曆', keywords: ['calendar'] },
    { to: '/app/quota', label: '堂數與付款', keywords: ['quota', 'pay'] },
    { to: '/app/alerts', label: '通知', keywords: ['alerts'] },
    { to: '/app/profile', label: '個人資料', keywords: ['profile'] },
  ],
  Teacher: [
    { to: '/teacher', label: '首頁', keywords: ['home'] },
    { to: '/teacher/calendar', label: '行事曆', keywords: ['calendar'] },
    { to: '/teacher/availability', label: '可預約時段（每週時段、特殊日期）', keywords: ['availability', 'hours', 'schedule', '休息'] },
    { to: '/teacher/students', label: '學生', keywords: ['students'] },
    { to: '/teacher/requests', label: '申請（改時間、新學生）', keywords: ['requests'] },
    { to: '/teacher/payments', label: '付款（收據確認）', keywords: ['payments', 'receipts'] },
    { to: '/teacher/consults', label: '諮詢', keywords: ['consults'] },
  ],
};

/** #3 ⌘K / Ctrl+K command menu. #4 its footer and the sidebar show the shortcuts. */
export function CommandMenu({ role, open, setOpen }: { role: Role; open: boolean; setOpen: (o: boolean) => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!open); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  useEffect(() => { if (!open) setQ(''); }, [open]);

  // Teacher: search students from the cache that the Students page already loaded (no extra request)
  const students = role === 'Teacher' ? qc.getQueryData<StudentSummary[]>(qk.students) ?? [] : [];
  const go = (to: string) => { setOpen(false); nav(to, { viewTransition: true }); };

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="快速搜尋" overlayClassName="cmdk-overlay" contentClassName="cmdk">
      <Command.Input value={q} onValueChange={setQ} placeholder="搜尋畫面、學生或動作…" />
      <Command.List>
        <Command.Empty>找不到結果</Command.Empty>
        <Command.Group heading="畫面">
          {PAGES[role].map((p) => (
            <Command.Item key={p.to} value={p.label} keywords={p.keywords} onSelect={() => go(p.to)}>{p.label}</Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="動作">
          {role === 'Student'
            ? <Command.Item value="預約課程 book a class" onSelect={() => go('/app/book')}>預約一堂課<span className="caption">B</span></Command.Item>
            : <>
                <Command.Item value="確認收據 confirm receipts" onSelect={() => go('/teacher/payments')}>確認收據</Command.Item>
                <Command.Item value="處理改時間 approve requests" onSelect={() => go('/teacher/requests')}>處理改時間申請</Command.Item>
              </>}
        </Command.Group>
        {students.length > 0 && (
          <Command.Group heading="學生">
            {students.map((s) => (
              <Command.Item key={s.id} value={`${s.name} ${s.lineId ?? ''}`} onSelect={() => go(`/teacher/students/${s.id}`)}>
                {s.name}<span className="caption">剩 {s.credits} 堂</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
      <div className="cmdk-foot" aria-hidden="true">
        <span><kbd>↑</kbd><kbd>↓</kbd> 選擇</span><span><kbd>Enter</kbd> 開啟</span><span><kbd>Esc</kbd> 關閉</span><span><kbd>{modKey}</kbd><kbd>K</kbd> 開關</span>
      </div>
    </Command.Dialog>
  );
}
