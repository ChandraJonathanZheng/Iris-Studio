import { useEffect, useRef } from 'react';
import { addDays, dayNum, monthNum, studioToday, wd } from '../lib/date';
import { useDays, useSlots } from '../lib/queries';
import { Sk } from './ui';

const DAY_LABEL: Record<string, string> = { past: '已過', closed: '休息', full: '額滿', later: '未開放' };

/**
 * Date strip + time chips (from the booking review):
 * every calendar date in order (never skipped), closed/full/past dates shown but disabled,
 * slots show 額滿 / 不可預約, and the "only free" toggle hides the disabled ones.
 */
export function SlotPicker({ date, time, onDate, onTime, onlyFree, setOnlyFree, exclude }: {
  date: string | null; time: string | null;
  onDate: (d: string) => void; onTime: (t: string | null) => void;
  onlyFree: boolean; setOnlyFree: (v: boolean) => void;
  /** the student's current slot when moving a lesson */
  exclude?: { date: string; time: string };
}) {
  const today = studioToday();
  const from = addDays(today, -1);
  const days = useDays(from);
  const slots = useSlots(date);
  const strip = useRef<HTMLDivElement>(null);

  // keep the selected date visible when the screen opens
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [days.data]);

  // if the chosen time became unavailable (refetch, toggle), clear it
  useEffect(() => {
    if (!time || !slots.data) return;
    const s = slots.data.find((x) => x.time === time);
    if (!s || s.state !== 'free') onTime(null);
  }, [slots.data, time, onTime]);

  return (
    <>
      <div className="row between"><p className="overline">選擇日期</p><p className="caption">{date ? `${Number(date.slice(5, 7))} 月` : ''}</p></div>
      <div className="dstrip" ref={strip} role="group" aria-label="日期">
        {days.isPending
          ? Array.from({ length: 6 }, (_, i) => <Sk key={i} w={60} h={80} />)
          : days.data?.map((d) => {
              const disabled = d.state !== 'open';
              const label = d.date === today && !disabled ? '今天' : DAY_LABEL[d.state] ?? '';
              return (
                <button
                  key={d.date} className={`day${d.state === 'past' ? ' past' : ''}`} disabled={disabled}
                  aria-pressed={date === d.date}
                  onClick={() => onDate(d.date)}
                >
                  {/* the visible text IS the accessible name; sr-only bits add month + state for screen readers */}
                  <span className="sr-only">{monthNum(d.date)}月</span><span>{wd(d.date)}</span><b>{dayNum(d.date)}<span className="sr-only">日</span></b><small>{label}{!label && <span className="sr-only">可預約</span>}</small>
                </button>
              );
            })}
      </div>
      <hr className="line" />
      <div className="row between">
        <p className="overline">選擇時段</p>
        <label className="switch-row">只顯示空的時段
          <button type="button" className="switch" role="switch" aria-checked={onlyFree} onClick={() => setOnlyFree(!onlyFree)} />
        </label>
      </div>
      {!date ? <p className="caption">請先選擇日期。</p>
        : slots.isPending ? <div className="chips">{Array.from({ length: 8 }, (_, i) => <Sk key={i} h={52} />)}</div>
        : (() => {
            const list = (slots.data ?? []).filter((s) => !onlyFree || s.state === 'free');
            if (list.length === 0) return <p className="caption">這天沒有空的時段，請選其他日期。</p>;
            return (
              <div className="chips" role="group" aria-label="時段">
                {list.map((s) => {
                  const mine = exclude && exclude.date === date && exclude.time === s.time;
                  const disabled = s.state !== 'free' || !!mine;
                  const sub = mine ? '目前' : s.state === 'full' ? '額滿' : s.state === 'past' ? '不可預約' : '';
                  return (
                    <button key={s.time} className="chip" disabled={disabled} aria-pressed={time === s.time}
                      aria-label={`${s.time} ${sub || '可預約'}`} onClick={() => onTime(s.time)}>
                      <b>{s.time}</b>{sub && <small>{sub}</small>}
                    </button>
                  );
                })}
              </div>
            );
          })()}
    </>
  );
}
