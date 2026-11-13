import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { addDays, studioToday } from '../lib/date';

/**
 * Date input for the whole app: tap the field → a month calendar pops up, opened on TODAY
 * (or on the chosen date), today ringed, past days (before `min`) disabled.
 * Keyboard: ← → ↑ ↓ move by day/week, PageUp/PageDown by month, Enter picks, Esc closes.
 * Value is "YYYY-MM-DD" in Taipei time, same as the old <input type="date">.
 */
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parts = (s: string) => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d }; };
const label = (s: string) => { const { y, m, d } = parts(s); const wd = new Date(Date.UTC(y, m, d)).getUTCDay(); return `${y} 年 ${m + 1} 月 ${d} 日（${WD[wd]}）`; };
const addMonths = (s: string, n: number) => {
  const { y, m, d } = parts(s); const t = new Date(Date.UTC(y, m + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return ymd(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last));
};

export function DateField({ id, value, onChange, min, max, placeholder = '選擇日期' }: {
  id: string; value: string; onChange: (v: string) => void; min?: string; max?: string; placeholder?: string;
}) {
  const today = studioToday();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(value || today);
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ok = (s: string) => (!min || s >= min) && (!max || s <= max);

  const place = () => {
    const r = btn.current!.getBoundingClientRect();
    const h = 360, below = r.bottom + 8 + h < window.innerHeight;
    const width = Math.min(340, window.innerWidth - 24);
    setPos({ top: below ? r.bottom + 8 : Math.max(12, r.top - 8 - h), left: Math.min(Math.max(12, r.left), window.innerWidth - width - 12), width });
  };
  useLayoutEffect(() => { if (open) { setFocus(value || today); place(); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => { if (open) pop.current?.querySelector<HTMLElement>(`[data-d="${focus}"]`)?.focus({ preventScroll: true }); }, [open, focus, pos]);

  const pick = (s: string) => { if (!ok(s)) return; onChange(s); setOpen(false); btn.current?.focus(); };
  const keys = (e: React.KeyboardEvent) => {
    const mv: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1), ArrowRight: () => addDays(focus, 1), ArrowUp: () => addDays(focus, -7), ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1), PageDown: () => addMonths(focus, 1),
    };
    if (mv[e.key]) { e.preventDefault(); setFocus(mv[e.key]()); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); }
  };

  const { y, m } = parts(focus);
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => ymd(y, m, i + 1))];
  const prevMonthOk = !min || addMonths(focus, -1).slice(0, 7) >= min.slice(0, 7);

  return (
    <>
      <button ref={btn} id={id} type="button" className={`input df-btn${value ? '' : ' empty'}`} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <Icon name="calendar" size={18} /><span>{value ? label(value) : placeholder}</span>
      </button>
      {open && pos && (
        <div ref={pop} className="df-pop" role="dialog" aria-label="選擇日期" style={{ top: pos.top, left: pos.left, width: pos.width }} onKeyDown={keys}>
          <div className="df-head">
            <button type="button" className="df-nav" aria-label="上個月" disabled={!prevMonthOk} onClick={() => setFocus(addMonths(focus, -1))}><Icon name="back" size={18} /></button>
            <p className="df-title" aria-live="polite">{y} 年 {m + 1} 月</p>
            <button type="button" className="df-nav" aria-label="下個月" onClick={() => setFocus(addMonths(focus, 1))}><Icon name="chev" size={18} /></button>
          </div>
          <div className="df-grid" role="grid" aria-label={`${y} 年 ${m + 1} 月`}>
            <div role="row" className="df-row">{WD.map((w) => <span key={w} role="columnheader" className="df-wd">{w}</span>)}</div>
            {Array.from({ length: Math.ceil(cells.length / 7) }, (_, r) => (
              <div role="row" className="df-row" key={r}>
                {cells.slice(r * 7, r * 7 + 7).map((s, i) => s ? (
                  <button key={s} type="button" role="gridcell" data-d={s} tabIndex={s === focus ? 0 : -1} disabled={!ok(s)}
                    className={`df-day${s === today ? ' is-today' : ''}${s === value ? ' is-sel' : ''}`}
                    aria-selected={s === value} aria-current={s === today ? 'date' : undefined} aria-label={label(s)}
                    onClick={() => pick(s)}>{Number(s.slice(8))}</button>
                ) : <span key={`e${i}`} className="df-day empty" />)}
              </div>
            ))}
          </div>
          <div className="df-foot">
            <button type="button" className="df-link" disabled={!ok(today)} onClick={() => pick(today)}>今天</button>
            <button type="button" className="df-link" onClick={() => { setOpen(false); btn.current?.focus(); }}>關閉</button>
          </div>
        </div>
      )}
    </>
  );
}
