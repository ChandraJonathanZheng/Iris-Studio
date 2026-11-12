import { useMemo, useState } from 'react';
import { Link, Outlet, useParams, useSearchParams } from 'react-router';
import { rangeProblems, startsInRange, TIME_OPTIONS, toMin, WEEK_ORDER, WEEKDAY_LABEL, weekdayOf } from '../lib/availability';
import { fmtDate, studioToday } from '../lib/date';
import { useAvailability, useDeleteOverride, useLessons, useSaveBookingSettings, useSaveOverride, useSaveWeekly } from '../lib/queries';
import type { Availability, BookingSettings, DateOverride, TimeRange, WeeklyDay } from '../lib/types';
import { Icon } from '../components/Icon';
import { RouteSheet, useSheetClose } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { ErrorCard, PageHead, PageSkeleton } from '../components/ui';

type Tab = 'weekly' | 'dates' | 'settings';
const TABS: { id: Tab; label: string }[] = [{ id: 'weekly', label: '每週時段' }, { id: 'dates', label: '特殊日期' }, { id: 'settings', label: '預約設定' }];
const LENGTHS = [30, 45, 60, 90, 120];
const GAPS = [0, 10, 15, 30, 60];
const ADVANCE = [7, 14, 30, 60, 90];
const rangeText = (r: TimeRange) => `${r.start} – ${r.end}`;
const sortRanges = (rs: TimeRange[]) => [...rs].sort((a, b) => toMin(a.start) - toMin(b.start));
const useFail = () => { const toast = useToast(); return (e: Error) => toast({ text: e.message, kind: 'error' }); };

export function AvailabilityPage() {
  const av = useAvailability();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as Tab) : 'weekly';
  const go = (t: Tab) => setParams(t === 'weekly' ? {} : { tab: t }, { replace: true });
  return (
    <>
      <PageHead title="可預約時段" over="學生會依這些時間預約" back />
      <div className="av-tabs" role="tablist" aria-label="可預約時段">
        {TABS.map((t) => (
          // only the selected tab's panel exists, so only it points at one
          <button key={t.id} role="tab" id={`av-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={tab === t.id ? `av-panel-${t.id}` : undefined} onClick={() => go(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="av" role="tabpanel" id={`av-panel-${tab}`} aria-labelledby={`av-tab-${tab}`}>
        {av.isPending ? <PageSkeleton blocks={[420]} /> : av.isError ? <ErrorCard error={av.error} retry={av.refetch} /> : (
          <>
            {tab === 'weekly' && <Weekly av={av.data} onGo={go} />}
            {tab === 'dates' && <Dates av={av.data} />}
            {tab === 'settings' && <Settings s={av.data.settings} />}
          </>
        )}
      </div>
      <Outlet />
    </>
  );
}

function Weekly({ av, onGo }: { av: Availability; onGo: (t: Tab) => void }) {
  const save = useSaveWeekly();
  const toast = useToast();
  const fail = useFail();
  const { lessonMinutes, gapMinutes, advanceDays } = av.settings;
  const update = (weekday: number, change: (d: WeeklyDay) => WeeklyDay, text: string) => {
    const before = av.weekly;
    save.mutate(av.weekly.map((d) => (d.weekday === weekday ? change(d) : d)), {
      onSuccess: () => toast({ text, undo: () => save.mutateAsync(before).then(() => {}) }),
      onError: fail,
    });
  };
  const today = studioToday();
  const upcomingOverrides = av.overrides.filter((o) => o.date >= today).length;
  const example = startsInRange({ start: '10:00', end: '13:00' }, lessonMinutes, gapMinutes);
  return (
    <>
      <section className="av-card" aria-labelledby="av-weekly-h">
        <h2 className="av-h" id="av-weekly-h">每週可預約時間</h2>
        <p className="av-sub">設定每週固定的上課時段，學生會依此預約。</p>
        <ul className="av-days">
          {WEEK_ORDER.map((wd) => {
            const day = av.weekly.find((d) => d.weekday === wd)!;
            const slots = day.ranges.flatMap((r) => startsInRange(r, lessonMinutes, gapMinutes));
            const problems = day.enabled ? rangeProblems(day.ranges, lessonMinutes) : [];
            const name = WEEKDAY_LABEL[wd];
            return (
              <li key={wd} className={`av-day${day.enabled ? '' : ' off'}`}>
                <div className="av-day-head">
                  <span className="av-day-name" id={`av-d-${wd}`}>{name}</span>
                  <button className="switch" role="switch" aria-checked={day.enabled} aria-labelledby={`av-d-${wd}`}
                    onClick={() => update(wd, (d) => ({ ...d, enabled: !d.enabled, ranges: !d.enabled && d.ranges.length === 0 ? [{ start: '10:00', end: '18:00' }] : d.ranges }),
                      `${name}${day.enabled ? '不開放預約' : '開放預約'}`)} />
                </div>
                {day.enabled ? (
                  <div className="av-day-body">
                    <div className="av-ranges">
                      {day.ranges.map((r, i) => (
                        <span className="av-range" key={`${r.start}-${r.end}`}>
                          <Link to={`range/${wd}/${i}`} className="av-range-edit" aria-label={`編輯${name} ${rangeText(r)}`}>{rangeText(r)}</Link>
                          <button className="av-range-del" aria-label={`刪除${name} ${rangeText(r)}`}
                            onClick={() => update(wd, (d) => ({ ...d, ranges: d.ranges.filter((_, j) => j !== i), enabled: d.ranges.length > 1 }), `已刪除 ${name} ${rangeText(r)}`)}>
                            <Icon name="trash" size={16} />
                          </button>
                        </span>
                      ))}
                      <Link to={`range/${wd}/new`} className="av-add"><Icon name="plus" size={16} />新增時段</Link>
                    </div>
                    {problems.length > 0 ? <p className="av-warn">{problems[0]}</p>
                      : <p className="av-preview">{slots.length ? `可預約 ${slots.length} 堂：${slots.join('、')}` : '這天排不出任何時段。'}</p>}
                  </div>
                ) : <p className="av-off">不開放預約</p>}
              </li>
            );
          })}
        </ul>
        <p className="av-info">
          <Icon name="info" size={16} />
          <span>系統依「每堂課時長」與「課程間隔」自動產生時段，已被預約的時間不會出現。例如 10:00 – 13:00（每堂 {lessonMinutes} 分鐘、間隔 {gapMinutes} 分鐘）→ {example.join('、') || '排不進課'}。</span>
        </p>
      </section>
      <button className="av-link-card" onClick={() => onGo('settings')}>
        <Icon name="gear" size={22} />
        <span><b>預約設定</b><small>每堂課 {lessonMinutes} 分鐘 · 間隔 {gapMinutes} 分鐘 · 可約 {advanceDays} 天內</small></span>
        <Icon name="chev" size={18} />
      </button>
      <button className="av-link-card" onClick={() => onGo('dates')}>
        <Icon name="calendar" size={22} />
        <span><b>特殊日期</b><small>{upcomingOverrides ? `已設定 ${upcomingOverrides} 天` : '設定例外的日期（休息或調整時段）'}</small></span>
        <Icon name="chev" size={18} />
      </button>
    </>
  );
}

function TimePair({ start, end, setStart, setEnd, idPrefix }: { start: string; end: string; setStart: (v: string) => void; setEnd: (v: string) => void; idPrefix: string }) {
  return (
    <div className="av-pair">
      <div className="field">
        <label htmlFor={`${idPrefix}-s`}>開始</label>
        <select id={`${idPrefix}-s`} className="input" value={start} onChange={(e) => setStart(e.target.value)}>{TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      <span className="av-dash" aria-hidden="true">–</span>
      <div className="field">
        <label htmlFor={`${idPrefix}-e`}>結束</label>
        <select id={`${idPrefix}-e`} className="input" value={end} onChange={(e) => setEnd(e.target.value)}>{TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select>
      </div>
    </div>
  );
}

/** /teacher/availability/range/:weekday/:idx — add (idx = new) or edit one weekly range. */
export function RangeSheet() {
  const { weekday, idx } = useParams();
  const av = useAvailability();
  const save = useSaveWeekly();
  const toast = useToast();
  const fail = useFail();
  const close = useSheetClose("/teacher/availability");
  const wd = Number(weekday);
  const day = av.data?.weekly.find((d) => d.weekday === wd);
  const index = idx !== 'new' ? Number(idx) : null;
  const existing = index !== null ? day?.ranges[index] : undefined;
  const [start, setStart] = useState(existing?.start ?? '10:00');
  const [end, setEnd] = useState(existing?.end ?? '12:00');
  if (!av.data || !day || (index !== null && !existing)) return null;
  const { lessonMinutes, gapMinutes } = av.data.settings;
  const ranges = sortRanges([...day.ranges.filter((_, i) => i !== index), { start, end }]);
  const problems = rangeProblems(ranges, lessonMinutes);
  const slots = startsInRange({ start, end }, lessonMinutes, gapMinutes);
  const name = WEEKDAY_LABEL[wd];
  const submit = () => {
    const before = av.data!.weekly;
    save.mutateAsync(before.map((d) => (d.weekday === wd ? { ...d, enabled: true, ranges } : d)))
      .then(() => toast({ text: `${name} ${start} – ${end} 已${index === null ? '新增' : '更新'}`, undo: () => save.mutateAsync(before).then(() => {}) }))
      .catch(fail);
    close();
  };
  return (
    <RouteSheet title={`${index === null ? '新增時段' : '編輯時段'} · ${name}`} parent="/teacher/availability">
      <TimePair start={start} end={end} setStart={setStart} setEnd={setEnd} idPrefix="rs" />
      {problems.length > 0 ? <p className="av-warn" role="alert">{problems[0]}</p>
        : <p className="av-preview" aria-live="polite">這段可以排 {slots.length} 堂：{slots.join('、')}</p>}
      <button className="btn primary block" disabled={problems.length > 0} onClick={submit}>{index === null ? '新增' : '儲存'}</button>
      <button className="btn secondary block" onClick={() => close()}>取消</button>
    </RouteSheet>
  );
}

function Dates({ av }: { av: Availability }) {
  const remove = useDeleteOverride();
  const restore = useSaveOverride();
  const toast = useToast();
  const fail = useFail();
  const today = studioToday();
  const upcoming = av.overrides.filter((o) => o.date >= today);
  const del = (o: DateOverride) => remove.mutate(o.date, {
    onSuccess: () => toast({ text: `已刪除 ${fmtDate(o.date)} 的特殊設定`, undo: () => restore.mutateAsync(o).then(() => {}) }),
    onError: fail,
  });
  return (
    <section className="av-card" aria-labelledby="av-dates-h">
      <h2 className="av-h" id="av-dates-h">特殊日期</h2>
      <p className="av-sub">某一天休息或想改時間，就在這裡設定。這天會取代每週時段。</p>
      <Link to="date/new" className="btn primary av-add-date"><Icon name="plus" size={18} />新增特殊日期</Link>
      {upcoming.length === 0 ? <p className="av-empty">還沒有特殊日期。</p> : (
        <ul className="av-overrides">
          {upcoming.map((o) => (
            <li key={o.date}>
              <Link to={`date/${o.date}`} className="av-ov-main" aria-label={`編輯 ${fmtDate(o.date)}`}>
                <span className="av-ov-date">{fmtDate(o.date)}</span>
                <span className={`av-ov-tag ${o.closed ? 'closed' : 'custom'}`}>{o.closed ? '全天休息' : '自訂時段'}</span>
                <span className="av-ov-detail">{o.closed ? o.note || '這天不開放預約' : `${o.ranges.map(rangeText).join('、')}${o.note ? ` · ${o.note}` : ''}`}</span>
              </Link>
              <button className="icon-btn flat hit" aria-label={`刪除 ${fmtDate(o.date)} 的特殊設定`} onClick={() => del(o)}><Icon name="trash" size={18} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** /teacher/availability/date/:date — closed all day, or its own hours. Lessons already booked are NOT cancelled. */
export function OverrideSheet() {
  const { date: param } = useParams();
  const av = useAvailability();
  const save = useSaveOverride();
  const toast = useToast();
  const fail = useFail();
  const close = useSheetClose("/teacher/availability?tab=dates");
  const today = studioToday();
  const existing = param !== 'new' ? av.data?.overrides.find((o) => o.date === param) : undefined;
  const [date, setDate] = useState(existing?.date ?? '');
  const [closed, setClosed] = useState(existing?.closed ?? true);
  const [ranges, setRanges] = useState<TimeRange[]>(existing?.ranges.length ? existing.ranges : [{ start: '14:00', end: '18:00' }]);
  const [note, setNote] = useState(existing?.note ?? '');
  const lessons = useLessons('teacher', date || today, date || today);
  const booked = useMemo(() => (date ? (lessons.data ?? []).filter((l) => l.date === date && l.status === 'Booked') : []), [lessons.data, date]);
  if (!av.data || (param !== 'new' && !existing)) return null;
  const { lessonMinutes, gapMinutes } = av.data.settings;
  const usual = date ? av.data.weekly.find((d) => d.weekday === weekdayOf(date)) : undefined;
  const problems = closed ? [] : ranges.length === 0 ? ['請至少加一個時段，或改成全天休息。'] : rangeProblems(ranges, lessonMinutes);
  const replaces = param === 'new' && !!date && av.data.overrides.some((o) => o.date === date);
  const ok = !!date && date >= today && problems.length === 0;
  const setRange = (i: number, r: TimeRange) => setRanges(ranges.map((x, j) => (j === i ? r : x)));
  const submit = () => {
    save.mutateAsync({ date, closed, ranges: closed ? [] : sortRanges(ranges), note: note.trim() })
      .then(() => toast({ text: `${fmtDate(date)} 已設定為${closed ? '全天休息' : '自訂時段'}` }))
      .catch(fail);
    close();
  };
  return (
    <RouteSheet title={existing ? `編輯 ${fmtDate(existing.date)}` : '新增特殊日期'} parent="/teacher/availability?tab=dates">
      {!existing && (
        <div className="field">
          <label htmlFor="ov-date">日期</label>
          <input id="ov-date" className="input" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          {date && usual && <p className="av-hint">平常{WEEKDAY_LABEL[usual.weekday]}：{usual.enabled ? usual.ranges.map(rangeText).join('、') : '不開放預約'}</p>}
          {replaces && <p className="av-hint">這天已經有特殊設定，儲存後會取代。</p>}
        </div>
      )}
      <fieldset className="av-fs">
        <legend>這天要</legend>
        <div className="cs-seg" role="radiogroup" aria-label="這天要">
          <button type="button" role="radio" aria-checked={closed} onClick={() => setClosed(true)}>全天休息</button>
          <button type="button" role="radio" aria-checked={!closed} onClick={() => setClosed(false)}>自訂時段</button>
        </div>
      </fieldset>
      {!closed && (
        <div className="av-ov-ranges">
          {ranges.map((r, i) => (
            <div className="av-ov-range" key={i}>
              <TimePair start={r.start} end={r.end} setStart={(v) => setRange(i, { ...r, start: v })} setEnd={(v) => setRange(i, { ...r, end: v })} idPrefix={`ov${i}`} />
              {ranges.length > 1 && <button type="button" className="icon-btn flat hit" aria-label={`刪除 ${rangeText(r)}`} onClick={() => setRanges(ranges.filter((_, j) => j !== i))}><Icon name="trash" size={18} /></button>}
            </div>
          ))}
          <button type="button" className="av-add" onClick={() => setRanges([...ranges, { start: '19:00', end: '21:00' }])}><Icon name="plus" size={16} />新增時段</button>
          {problems.length > 0 ? <p className="av-warn" role="alert">{problems[0]}</p>
            : <p className="av-preview">這天可預約：{ranges.flatMap((r) => startsInRange(r, lessonMinutes, gapMinutes)).sort().join('、') || '沒有時段'}</p>}
        </div>
      )}
      <div className="field">
        <label htmlFor="ov-note">備註（選填）</label>
        <input id="ov-note" className="input" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：參加音樂會" />
      </div>
      {booked.length > 0 && (
        <p className="av-booked" role="note">
          這天已有 {booked.length} 堂課（{booked.map((l) => `${l.time} ${l.studentName}`).join('、')}）。特殊日期只影響之後的預約，<b>不會自動取消這些課</b>，需要的話請到行事曆處理。
        </p>
      )}
      <button className="btn primary block" disabled={!ok} onClick={submit}>儲存</button>
      <button className="btn secondary block" onClick={() => close()}>取消</button>
    </RouteSheet>
  );
}

function Settings({ s }: { s: BookingSettings }) {
  const save = useSaveBookingSettings();
  const toast = useToast();
  const fail = useFail();
  const change = (patch: Partial<BookingSettings>, text: string) => {
    const before = s;
    save.mutate({ ...s, ...patch }, { onSuccess: () => toast({ text, undo: () => save.mutateAsync(before).then(() => {}) }), onError: fail });
  };
  const row = (id: string, label: string, hint: string, value: number, options: number[], fmt: (n: number) => string, key: keyof BookingSettings) => (
    <div className="av-set">
      <div><label htmlFor={id}>{label}</label><p className="av-hint">{hint}</p></div>
      <select id={id} className="input" value={value} onChange={(e) => change({ [key]: Number(e.target.value) }, `${label}改為 ${fmt(Number(e.target.value))}`)}>
        {options.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}
      </select>
    </div>
  );
  return (
    <section className="av-card" aria-labelledby="av-set-h">
      <h2 className="av-h" id="av-set-h">預約設定</h2>
      <p className="av-sub">改了之後，學生看到的時段會馬上更新。已經預約的課不受影響。</p>
      <div className="av-sets">
        {row('set-len', '每堂課時長', '新預約的課有多長', s.lessonMinutes, LENGTHS, (n) => `${n} 分鐘`, 'lessonMinutes')}
        {row('set-gap', '課程間隔', '兩堂課之間休息多久', s.gapMinutes, GAPS, (n) => (n === 0 ? '不休息' : `${n} 分鐘`), 'gapMinutes')}
        {row('set-adv', '可提前預約', '學生最遠可以預約到幾天後', s.advanceDays, ADVANCE, (n) => `${n} 天內`, 'advanceDays')}
      </div>
    </section>
  );
}
