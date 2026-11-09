import { useEffect, useMemo, useState } from 'react';
import { studioToday, wd, dayNum, monthNum } from '../lib/date';
import { useDays, useSlots } from '../lib/queries';
import type { DayState } from '../lib/types';
import { ErrorCard, Sk } from './ui';

export interface Picked { date: string; time: string }

const NOTE: Partial<Record<DayState, string>> = { closed: '休息', full: '額滿', past: '已過', later: '未開放' };

/**
 * Date strip + time chips, generated from Iris's availability (always fresh: staleTime 0).
 * Used by 預約, 改時間, 老師預約 and 老師提議. Unavailable days/times are dashed or struck, never silently hidden
 * unless 只顯示空的時段 is on.
 */
export function SlotPicker({ value, onChange, onlyFreeToggle = true, ignore }: {
  value: Picked | null; onChange: (p: Picked | null) => void; onlyFreeToggle?: boolean;
  /** a slot that is the lesson's own current slot — shown as taken so it can't be re-picked */
  ignore?: Picked;
}) {
  const from = useMemo(() => studioToday(), []);
  const days = useDays(from);
  const [date, setDate] = useState<string | null>(value?.date ?? null);
  const [onlyFree, setOnlyFree] = useState(false);
  const slots = useSlots(date);

  // first open day is preselected
  useEffect(() => {
    if (!date && days.data) setDate(days.data.find((d) => d.state === 'open')?.date ?? null);
  }, [days.data, date]);

  if (days.isError) return <ErrorCard error={days.error} retry={() => days.refetch()} />;
  if (days.isPending) return <Sk h={96} card />;

  const pickDate = (d: string) => { setDate(d); if (value && value.date !== d) onChange(null); };
  const list = (slots.data ?? []).filter((s) => !onlyFree || s.state === 'free');

  return (
    <div className="stack">
      <div className="daystrip" role="group" aria-label="選擇日期">
        {days.data.map((d) => {
          const off = d.state !== 'open';
          return (
            <button key={d.date} type="button" className="day" disabled={off} aria-pressed={d.date === date} onClick={() => pickDate(d.date)}>
              <span className="sr">{monthNum(d.date)} 月</span>
              <span className="dw">週{wd(d.date)}</span><span className="dn">{dayNum(d.date)}</span>
              <span className="dx">{NOTE[d.state] ?? (d.date === from ? '今天' : '')}</span>
            </button>
          );
        })}
      </div>
      {onlyFreeToggle && (
        <label className="row between" style={{ minHeight: 44 }}>
          <span className="sub">只顯示空的時段</span>
          <button type="button" role="switch" aria-checked={onlyFree} className="switch" onClick={() => setOnlyFree(!onlyFree)} />
        </label>
      )}
      {!date ? <p className="sub">目前沒有可預約的日期。</p>
        : slots.isPending ? <Sk h={110} card />
        : slots.isError ? <ErrorCard error={slots.error} retry={() => slots.refetch()} />
        : list.length === 0 ? <p className="sub">這天沒有空的時段，請換一天。</p>
        : (
          <div className="times" role="group" aria-label="選擇時間">
            {list.map((s) => {
              const own = !!ignore && ignore.date === date && ignore.time === s.time;
              const free = s.state === 'free' && !own;
              return (
                <button key={s.time} type="button" className="time" disabled={!free} aria-pressed={value?.date === date && value?.time === s.time}
                  onClick={() => onChange({ date: date, time: s.time })}>
                  {s.time}{!free && <span className="sr">{own ? '（目前時段）' : '（不可選）'}</span>}
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}
