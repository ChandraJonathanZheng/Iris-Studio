import { useEffect, useRef } from 'react';
import { addDays, dayNum, monthNum, studioToday, wd } from '../lib/date';
import { useDays, useSlots } from '../lib/queries';
import type { DayState } from '../lib/types';
import { Sk } from './ui';

const NOTE: Partial<Record<DayState, string>> = { past: '已過', closed: '休息', full: '額滿', later: '未開放' };

/**
 * Date strip + time chips, generated from Iris's availability (always fresh: staleTime 0).
 * Used by 預約, 改時間, 老師預約 and 老師提議. A picked time that stops being free is cleared.
 * `exclude` = the lesson's own current slot, shown as 目前 so it can't be re-picked.
 */
export function SlotPicker({ date, time, onDate, onTime, onlyFree, setOnlyFree, exclude }: {
  date: string | null; time: string | null;
  onDate: (date: string) => void; onTime: (time: string | null) => void;
  onlyFree: boolean; setOnlyFree: (v: boolean) => void;
  exclude?: { date: string; time: string };
}) {
  const today = studioToday();
  const days = useDays(addDays(today, -1));
  const slots = useSlots(date);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [days.data]);
  useEffect(() => {
    if (!time || !slots.data) return;
    const s = slots.data.find((x) => x.time === time);
    if (!s || s.state !== 'free') onTime(null);
  }, [slots.data, time, onTime]);

  const shown = (slots.data ?? []).filter((s) => !onlyFree || s.state === 'free');
  return (
    <>
      <div className="row between">
        <p className="overline">選擇日期</p>
        <p className="caption">{date ? `${Number(date.slice(5, 7))} 月` : ''}</p>
      </div>
      <div className="dstrip" ref={strip} role="group" aria-label="日期">
        {days.isPending
          ? Array.from({ length: 6 }, (_, i) => <Sk key={i} w={60} h={80} />)
          : days.data?.map((d) => {
            const off = d.state !== 'open';
            const note = d.date === today && !off ? '今天' : NOTE[d.state] ?? '';
            return (
              <button key={d.date} className={`day${d.state === 'past' ? ' past' : ''}`} disabled={off} aria-pressed={date === d.date} onClick={() => onDate(d.date)}>
                <span className="sr-only">{monthNum(d.date)}月</span>
                <span>{wd(d.date)}</span>
                <b>{dayNum(d.date)}<span className="sr-only">日</span></b>
                <small>{note}{!note && <span className="sr-only">可預約</span>}</small>
              </button>
            );
          })}
      </div>
      <hr className="line" />
      <div className="row between">
        <p className="overline">選擇時段</p>
        <label className="switch-row">
          只顯示空的時段
          <button type="button" className="switch" role="switch" aria-checked={onlyFree} onClick={() => setOnlyFree(!onlyFree)} />
        </label>
      </div>
      {!date ? <p className="caption">請先選擇日期。</p>
        : slots.isPending ? <div className="chips">{Array.from({ length: 8 }, (_, i) => <Sk key={i} h={52} />)}</div>
        : shown.length === 0 ? <p className="caption">這天沒有空的時段，請選其他日期。</p>
        : (
          <div className="chips" role="group" aria-label="時段">
            {shown.map((s) => {
              const current = !!exclude && exclude.date === date && exclude.time === s.time;
              const note = current ? '目前' : s.state === 'full' ? '額滿' : s.state === 'past' ? '不可預約' : '';
              return (
                <button key={s.time} className="chip" disabled={s.state !== 'free' || current} aria-pressed={time === s.time}
                  aria-label={`${s.time} ${note || '可預約'}`} onClick={() => onTime(s.time)}>
                  <b>{s.time}</b>{note && <small>{note}</small>}
                </button>
              );
            })}
          </div>
        )}
    </>
  );
}
