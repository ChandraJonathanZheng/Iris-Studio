// B1 — Balanced (Before → After): one card for every reschedule in the teacher inbox.
// 改時間 (the student asks) and 等學生回覆 (Iris proposed) both use it, so the two tabs read the same way:
// who · status pill → 原定時段 vs 希望改至 (side by side on desktop, stacked on phones) → reason → actions.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { dayNum, initialOf, monthNum, wd } from '../lib/date';

export type RescheduleStatus = 'available' | 'conflict' | 'pending' | 'approved' | 'declined';

// label + icon per status. Colour comes from CSS (.rs.is-<status>), so a status is never shown by colour alone.
const STATUS: Record<RescheduleStatus, { text: string; icon: string }> = {
  available: { text: '可預約', icon: 'check' },
  conflict: { text: '時段衝突', icon: 'warning' },
  pending: { text: '等待回覆', icon: 'clock' },
  approved: { text: '已同意', icon: 'check' },
  declined: { text: '已婉拒', icon: 'x' },
};

type Slot = { date: string; time: string };

function SlotCard({ kind, label, slot, empty = '請選擇時段', hint }: { kind: 'from' | 'to'; label: string; slot: Slot | null; empty?: string; hint?: string }) {
  return (
    <div className={`rs-slot is-${kind}${slot ? '' : ' is-empty'}`} aria-live={kind === 'to' ? 'polite' : undefined}>
      <p className="rs-slot-k"><Icon name="calendar" size={18} />{label}</p>
      {/* 11/21 big (DM Sans, tabular), 星期六 · 11:00 under it — the date is what Iris scans for */}
      {slot ? (
        // date + weekday line share one box as wide as the longer of the two; the date's characters are spread
        // across it (flex space-between), so "11/21" ends exactly where "星期六 · 11:00" ends
        <div className="rs-slot-dt">
          <p className="rs-slot-d"><span className="sr-only">{monthNum(slot.date)}/{dayNum(slot.date)}</span>
            {[...`${monthNum(slot.date)}/${dayNum(slot.date)}`].map((ch, i) => <span key={i} aria-hidden="true">{ch}</span>)}</p>
          <p className="rs-slot-t">星期{wd(slot.date)} · {slot.time}</p>
        </div>
      ) : <>
        <p className="rs-slot-d" aria-hidden="true">—</p>
        <p className="rs-slot-t">{empty}</p>
      </>}
      {hint && <p className="rs-slot-h">{hint}</p>}
    </div>
  );
}

/**
 * The B1 before → after pair on its own, for every place in the app that shows a time change
 * (提議改時間 / 婉拒 sheets, the student's 申請改時間 page and 老師提議 card).
 * to = null while nothing is picked yet: the after card shows "—" so the layout doesn't jump when a slot is chosen.
 * Side by side when there is room (≥ 560 px), stacked with a ↓ on phones / narrow sheets.
 */
export function SlotCompare({ from, to, fromLabel = '原定時段', toLabel = '希望改至', fromHint, toHint, tone = 'ok', className = '' }: {
  from: Slot; to: Slot | null; fromLabel?: string; toLabel?: string; fromHint?: string; toHint?: string;
  /** ok = sage "after" card · bad = the after slot is taken (soft red) */
  tone?: 'ok' | 'bad'; className?: string;
}) {
  return (
    <div className={`rs-cmpwrap is-${tone} ${className}`}>
      <div className="rs-cmp">
        <SlotCard kind="from" label={fromLabel} slot={from} hint={fromHint} />
        <span className="rs-arrow" aria-hidden="true"><Icon name="arrow" size={20} /></span>
        <SlotCard kind="to" label={toLabel} slot={to} hint={toHint} />
      </div>
    </div>
  );
}

/**
 * Status pill. With `info`, it becomes a button with a tooltip: opens on click/tap, on keyboard focus, or after
 * resting the mouse on it for 2 s; closes on Esc, a second click, or clicking anywhere else.
 */
function StatusPill({ id, status, info }: { id: string; status: RescheduleStatus; info?: string }) {
  const st = STATUS[status];
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const body = <><span className="rs-pill-ic" aria-hidden="true"><Icon name={st.icon} size={14} /></span><span className="sr-only">狀態：</span>{st.text}</>;
  if (!info) return <p className="rs-pill">{body}</p>;
  const tip = `rs-tip-${id}`;
  return (
    <span className="rs-pill-wrap" ref={wrap}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') timer.current = window.setTimeout(() => setOpen(true), 2000); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') { window.clearTimeout(timer.current); setOpen(false); } }}>
      <button type="button" className="rs-pill is-btn" aria-describedby={tip} aria-expanded={open}
        onClick={() => { window.clearTimeout(timer.current); setOpen((o) => !o); }}
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setOpen(true); }} onBlur={() => setOpen(false)}>{body}</button>
      <span role="tooltip" id={tip} className={`rs-tip${open ? ' is-open' : ''}`}>{info}</span>
    </span>
  );
}

export function RescheduleCard({ id, name, sub, status, statusInfo, from, to, toLabel = '希望改至', reasonLabel = '申請原因', reason, note, actions, busy }: {
  /** shown as a tooltip on the status pill (e.g. why it's 時段衝突) */
  statusInfo?: string;
  id: string; name: string; sub?: string; status: RescheduleStatus;
  from: Slot; to: Slot; toLabel?: string;
  reasonLabel?: string; reason?: string;
  /** extra line under the reason, e.g. the conflict hint */
  note?: ReactNode;
  /** buttons; leave out for decided cards (已同意 / 已婉拒 have nothing left to do) */
  actions?: ReactNode;
  busy?: boolean;
}) {
  return (
    <article className={`rs is-${status}`} aria-labelledby={`rs-${id}`} aria-busy={busy || undefined}>
      <header className="rs-head">
        <span className="avatar rs-avatar" aria-hidden="true">{initialOf(name)}</span>
        <div className="rs-who">
          <h4 className="rs-name" id={`rs-${id}`}>{name}</h4>
          {sub && <p className="rs-sub">{sub}</p>}
        </div>
        <StatusPill id={id} status={status} info={statusInfo} />
      </header>
      <SlotCompare from={from} to={to} toLabel={toLabel} />
      {reason && <p className="rs-reason"><span className="rs-reason-ic" aria-hidden="true"><Icon name="msg" size={15} /></span><span><b className="cm-label">{reasonLabel}</b><b>：</b><em className="rs-reason-v">{reason}</em></span></p>}
      {note}
      {actions && <footer className="rs-foot">{actions}</footer>}
    </article>
  );
}
