import { useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';
import { ApiError } from '../lib/api';
import { rangeProblems, slotTimesFor, startsInRange, TIME_OPTIONS, toMin, WEEKDAY_LABEL, WEEK_ORDER, weekdayOf } from '../lib/availability';
import { fmtDate, studioToday } from '../lib/date';
import { monthRange } from '../lib/prefetch';
import { useAvailability, useDeleteOverride, useLessons, useSaveBookingSettings, useSaveOverride, useSaveWeekly } from '../lib/queries';
import type { Availability, BookingSettings, DateOverride, TimeRange, WeeklyDay } from '../lib/types';
import { Icon } from '../components/Icon';
import { RouteSheet, useSheetClose } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Empty, ErrorCard, PageHead, PageSkeleton, Switch, Tabs } from '../components/ui';

const PARENT = '/teacher/availability';
const errText = (e: unknown) => (e instanceof ApiError ? e.message : '儲存失敗，請再試一次。');
const rangeText = (r: TimeRange) => `${r.start}–${r.end}`;
const sortRanges = (rs: TimeRange[]) => [...rs].sort((a, b) => toMin(a.start) - toMin(b.start));

function Preview({ ranges, s }: { ranges: TimeRange[]; s: BookingSettings }) {
  const times = [...new Set(ranges.flatMap((r) => startsInRange(r, s.lessonMinutes, s.gapMinutes)))].sort();
  const problems = rangeProblems(ranges, s.lessonMinutes);
  return (
    <>
      {ranges.length > 0 && <p className="cap">{times.length ? `可預約 ${times.length} 堂：${times.join('、')}` : '這些時段排不進任何一堂課。'}</p>}
      {problems.map((p) => <p key={p} className="err">◆ {p}</p>)}
    </>
  );
}

/* ---------------------------------------------------------------- 每週時段 */
function WeeklyTab({ av }: { av: Availability }) {
  const save = useSaveWeekly();
  const toast = useToast();
  const apply = (next: WeeklyDay[], text: string) => {
    const prev = av.weekly;
    save.mutate(next, { onSuccess: () => toast({ text, undo: () => save.mutateAsync(prev).then(() => undefined) }), onError: (e) => toast({ text: errText(e), kind: 'error' }) });
  };
  return (
    <div className="stack">
      {WEEK_ORDER.map((wd) => {
        const day = av.weekly.find((w) => w.weekday === wd) ?? { weekday: wd, enabled: false, ranges: [] };
        const ranges = sortRanges(day.ranges);
        return (
          <section key={wd} className="card" aria-label={WEEKDAY_LABEL[wd]}>
            <div className="row between"><h2 className="sec">{WEEKDAY_LABEL[wd]}</h2>
              <div className="row"><span className="sub">{day.enabled ? '開放' : '休息'}</span>
                <Switch checked={day.enabled} label={`${WEEKDAY_LABEL[wd]}開放預約`} onChange={(v) => apply(av.weekly.map((w) => (w.weekday === wd ? { ...w, enabled: v } : w)), `${WEEKDAY_LABEL[wd]}${v ? '已開放' : '改為休息'}`)} /></div></div>
            {day.enabled && (
              <>
                <div className="chips" style={{ flexWrap: 'wrap' }}>
                  {ranges.map((r, i) => (
                    <span key={rangeText(r)} className="chip choice row" style={{ gap: 4, padding: '0 4px 0 4px' }}>
                      <Link to={`range/${wd}/${i}`} style={{ color: 'inherit', padding: '0 10px', minHeight: 44, display: 'inline-flex', alignItems: 'center' }} aria-label={`編輯 ${rangeText(r)}`}>{rangeText(r)}</Link>
                      <button className="iconbtn" style={{ width: 36, height: 36, boxShadow: 'none', background: 'none' }} aria-label={`刪除 ${rangeText(r)}`}
                        onClick={() => apply(av.weekly.map((w) => (w.weekday === wd ? { ...w, ranges: ranges.filter((_, k) => k !== i) } : w)), `已刪除 ${rangeText(r)}`)}><Icon name="trash" size={16} /></button>
                    </span>
                  ))}
                  <Link className="chip filter row" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--sage-text)' }} to={`range/${wd}/new`}><Icon name="plus" size={16} />新增時段</Link>
                </div>
                <Preview ranges={ranges} s={av.settings} />
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- 特殊日期 */
function OverridesTab({ av }: { av: Availability }) {
  const nav = useNavigate();
  const [date, setDate] = useState('');
  const today = studioToday();
  return (
    <div className="stack">
      <section className="card">
        <h2 className="sec">新增特殊日期</h2>
        <p className="sub">這天會取代每週時段：可以整天休息，或只開放特定時間。</p>
        <div className="row"><input aria-label="日期" className="input" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn primary" disabled={!date || date < today} onClick={() => nav(`date/${date}`)}>設定</button></div>
      </section>
      {av.overrides.length === 0 ? <Empty text="目前沒有特殊日期。" /> : (
        <div className="list">{av.overrides.map((o) => (
          <Link key={o.date} className="li" to={`date/${o.date}`}>
            <div className="grow"><div className="name" style={{ fontSize: 16 }}>{fmtDate(o.date)}{o.note ? ` · ${o.note}` : ''}</div>
              <div className="cap">{o.closed ? '全天休息' : o.ranges.map(rangeText).join('、') || '沒有開放時段'}</div></div><Icon name="chev" size={18} />
          </Link>
        ))}</div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- 預約設定 */
function SettingsTab({ av }: { av: Availability }) {
  const save = useSaveBookingSettings();
  const toast = useToast();
  const s = av.settings;
  const change = (patch: Partial<BookingSettings>) => save.mutate({ ...s, ...patch }, {
    onSuccess: () => toast({ text: '已更新，學生看到的時段會立刻跟著變', undo: () => save.mutateAsync(s).then(() => undefined) }),
    onError: (e) => toast({ text: errText(e), kind: 'error' }),
  });
  const sel = (id: string, label: string, value: number, opts: number[], key: keyof BookingSettings, unit: string) => (
    <div className="field"><label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => change({ [key]: Number(e.target.value) })}>{opts.map((o) => <option key={o} value={o}>{o} {unit}</option>)}</select></div>
  );
  return (
    <section className="card">
      {sel('s-len', '每堂課時長', s.lessonMinutes, [30, 45, 60, 90, 120], 'lessonMinutes', '分鐘')}
      {sel('s-gap', '課程間隔', s.gapMinutes, [0, 10, 15, 30, 60], 'gapMinutes', '分鐘')}
      {sel('s-adv', '可提前預約', s.advanceDays, [7, 14, 30, 60, 90], 'advanceDays', '天')}
    </section>
  );
}

export function AvailabilityPage() {
  const av = useAvailability();
  const [tab, setTab] = useState<'weekly' | 'dates' | 'settings'>('weekly');
  return (
    <div className="page">
      <PageHead title="可預約時段" over="學生看到的時段" />
      <Tabs value={tab} onChange={setTab} options={[{ value: 'weekly', label: '每週時段' }, { value: 'dates', label: '特殊日期' }, { value: 'settings', label: '預約設定' }]} />
      {av.isPending ? <PageSkeleton blocks={[160, 160]} /> : av.isError ? <ErrorCard error={av.error} retry={() => av.refetch()} /> : (
        tab === 'weekly' ? <WeeklyTab av={av.data} /> : tab === 'dates' ? <OverridesTab av={av.data} /> : <SettingsTab av={av.data} />
      )}
      <Outlet />
    </div>
  );
}

/* ---------------------------------------------------------------- sheets */
function RangeFields({ value, onChange }: { value: TimeRange; onChange: (r: TimeRange) => void }) {
  return (
    <div className="grid2">
      <div className="field"><label htmlFor="r-s">開始</label><select id="r-s" className="select" value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })}>{TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select></div>
      <div className="field"><label htmlFor="r-e">結束</label><select id="r-e" className="select" value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value })}>{TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select></div>
    </div>
  );
}

export function RangeSheet() {
  const { weekday: wdParam, idx = 'new' } = useParams();
  const wd = Number(wdParam);
  const av = useAvailability();
  const save = useSaveWeekly();
  const toast = useToast();
  const close = useSheetClose(PARENT);
  const day = av.data?.weekly.find((w) => w.weekday === wd);
  const sorted = sortRanges(day?.ranges ?? []);
  const i = idx === 'new' ? -1 : Number(idx);
  const [r, setR] = useState<TimeRange | null>(null);
  const cur = r ?? (i >= 0 ? sorted[i] : undefined) ?? { start: '09:00', end: '12:00' };

  if (!av.data || !day) return <RouteSheet title="時段" parent={PARENT}><p className="sub">載入中…</p></RouteSheet>;
  const next = sortRanges(i >= 0 ? sorted.map((x, k) => (k === i ? cur : x)) : [...sorted, cur]);
  const problems = rangeProblems(next, av.data.settings.lessonMinutes);
  const commit = (ranges: TimeRange[], text: string) => {
    const prev = av.data!.weekly;
    save.mutate(av.data!.weekly.map((w) => (w.weekday === wd ? { ...w, ranges } : w)), {
      onSuccess: () => { close(); toast({ text, undo: () => save.mutateAsync(prev).then(() => undefined) }); },
      onError: (e) => toast({ text: errText(e), kind: 'error' }),
    });
  };

  return (
    <RouteSheet title={`${WEEKDAY_LABEL[wd]} · ${i >= 0 ? '編輯時段' : '新增時段'}`} parent={PARENT}>
      <RangeFields value={cur} onChange={setR} />
      <Preview ranges={next} s={av.data.settings} />
      <button className="btn primary block" disabled={problems.length > 0 || save.isPending} onClick={() => commit(next, '已儲存時段')}>儲存</button>
      {i >= 0 && <button className="btn dtext" onClick={() => commit(sorted.filter((_, k) => k !== i), '已刪除時段')}>刪除這個時段</button>}
    </RouteSheet>
  );
}

export function OverrideSheet() {
  const { date = '' } = useParams();
  const av = useAvailability();
  const save = useSaveOverride();
  const del = useDeleteOverride();
  const toast = useToast();
  const close = useSheetClose(PARENT);
  const [from, to] = monthRange();
  const lessons = useLessons('teacher', from, to);
  const existing = av.data?.overrides.find((o) => o.date === date);
  const [draft, setDraft] = useState<DateOverride | null>(null);
  const o = draft ?? existing ?? { date, closed: true, ranges: [], note: '' };
  const booked = (lessons.data ?? []).filter((l) => l.date === date && l.status === 'Booked');

  if (!av.data) return <RouteSheet title="特殊日期" parent={PARENT}><p className="sub">載入中…</p></RouteSheet>;
  const usual = av.data.weekly.find((w) => w.weekday === weekdayOf(date));
  const problems = o.closed ? [] : rangeProblems(o.ranges, av.data.settings.lessonMinutes);
  const set = (p: Partial<DateOverride>) => setDraft({ ...o, ...p });
  const undoTo = (prev: DateOverride | undefined) => () => (prev ? save.mutateAsync(prev) : del.mutateAsync(date)).then(() => undefined);

  return (
    <RouteSheet title={`特殊日期 ${fmtDate(date)}`} parent={PARENT}>
      <p className="cap">平常這天：{usual?.enabled && usual.ranges.length ? usual.ranges.map(rangeText).join('、') : '休息'}</p>
      {booked.length > 0 && (
        <div className="info" style={{ background: 'var(--warn-tint)' }}>◆ 這天已有 {booked.length} 堂課（{booked.map((l) => `${l.time} ${l.studentName}`).join('、')}）。不會自動取消，請到<Link to="/teacher/calendar"> 行事曆 </Link>處理。</div>
      )}
      <div className="row between"><span className="label">全天休息</span><Switch checked={o.closed} label="全天休息" onChange={(v) => set({ closed: v, ranges: v ? [] : o.ranges.length ? o.ranges : [{ start: '14:00', end: '18:00' }] })} /></div>
      {!o.closed && (
        <div className="stack">
          {o.ranges.map((r, k) => (
            <div key={k} className="stack s2">
              <RangeFields value={r} onChange={(nr) => set({ ranges: o.ranges.map((x, j) => (j === k ? nr : x)) })} />
              <button className="btn dtext" style={{ alignSelf: 'flex-start' }} onClick={() => set({ ranges: o.ranges.filter((_, j) => j !== k) })}>移除這段</button>
            </div>
          ))}
          <button className="btn secondary sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ ranges: [...o.ranges, { start: '09:00', end: '12:00' }] })}><Icon name="plus" size={18} />新增時段</button>
          <Preview ranges={o.ranges} s={av.data.settings} />
          {slotTimesFor({ ...av.data, overrides: [{ ...o, closed: false }] }, date).length === 0 && o.ranges.length === 0 && <p className="err">請至少新增一段時間，或選擇全天休息。</p>}
        </div>
      )}
      <div className="field"><label htmlFor="on">備註（選填）</label><input id="on" className="input" maxLength={60} value={o.note} onChange={(e) => set({ note: e.target.value })} placeholder="例如：參加音樂會" /></div>
      <button className="btn primary block" disabled={problems.length > 0 || (!o.closed && o.ranges.length === 0) || save.isPending}
        onClick={() => save.mutate(o, { onSuccess: () => { close(); toast({ text: `${fmtDate(date)} 已設定`, undo: undoTo(existing) }); }, onError: (e) => toast({ text: errText(e), kind: 'error' }) })}>儲存</button>
      {existing && <button className="btn dtext" onClick={() => del.mutate(date, { onSuccess: () => { close(); toast({ text: '已移除特殊日期', undo: undoTo(existing) }); } })}>移除這個特殊日期</button>}
    </RouteSheet>
  );
}
