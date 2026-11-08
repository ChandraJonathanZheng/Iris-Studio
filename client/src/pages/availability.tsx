import { useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { RouteSheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { ErrorCard, PageHead, PageSkeleton } from '../components/ui';
import {
  TIME_OPTIONS, WEEKDAY_LABEL, WEEK_ORDER, rangeProblems, startsInRange, toMin, weekdayOf,
} from '../lib/availability';
import { fmtDate, studioToday } from '../lib/date';
import {
  useAvailability, useDeleteOverride, useLessons, useSaveBookingSettings, useSaveOverride, useSaveWeekly,
} from '../lib/queries';
import type { Availability, BookingSettings, DateOverride, TimeRange } from '../lib/types';

/**
 * 可預約時段 — Iris decides when students can book. Students never see a fixed list of times any more:
 * their slots are generated from these settings (lib/availability.ts), minus anything already booked.
 * Every change saves straight away (no "save" button to forget) and shows a toast with 復原.
 */
type Tab = 'weekly' | 'dates' | 'settings';
const TABS: { id: Tab; label: string }[] = [{ id: 'weekly', label: '每週時段' }, { id: 'dates', label: '特殊日期' }, { id: 'settings', label: '預約設定' }];

const LESSON_OPTS = [30, 45, 60, 90, 120];
const GAP_OPTS = [0, 10, 15, 30, 60];
const ADVANCE_OPTS = [7, 14, 30, 60, 90];

const rangeText = (r: TimeRange) => `${r.start} – ${r.end}`;
const sortRanges = (rs: TimeRange[]) => [...rs].sort((a, b) => toMin(a.start) - toMin(b.start));
const fail = (toast: ReturnType<typeof useToast>) => (e: unknown) => toast({ text: (e as Error).message, kind: 'error' });

export function AvailabilityPage() {
  const av = useAvailability();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.some((t) => t.id === sp.get('tab')) ? sp.get('tab') : 'weekly') as Tab;
  const go = (t: Tab) => setSp(t === 'weekly' ? {} : { tab: t }, { replace: true });

  return (
    <>
      <PageHead title="可預約時段" over="學生會依這些時間預約" back />
      <div className="av-tabs" role="tablist" aria-label="可預約時段">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`av-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`av-panel-${t.id}`} onClick={() => go(t.id)}>{t.label}</button>
        ))}
      </div>
      {av.isPending ? <PageSkeleton blocks={[420]} /> : av.isError ? <ErrorCard error={av.error} retry={av.refetch} /> : (
        <div className="av" role="tabpanel" id={`av-panel-${tab}`} aria-labelledby={`av-tab-${tab}`}>
          {tab === 'weekly' && <WeeklyPanel av={av.data} onGo={go} />}
          {tab === 'dates' && <DatesPanel av={av.data} />}
          {tab === 'settings' && <SettingsPanel s={av.data.settings} />}
        </div>
      )}
      <Outlet />
    </>
  );
}

/* ---------- 每週時段 ---------- */
function WeeklyPanel({ av, onGo }: { av: Availability; onGo: (t: Tab) => void }) {
  const save = useSaveWeekly();
  const toast = useToast();
  const { lessonMinutes, gapMinutes, advanceDays } = av.settings;

  const commit = (weekday: number, patch: (d: Availability['weekly'][number]) => Availability['weekly'][number], msg: string) => {
    const prev = av.weekly;
    const next = av.weekly.map((d) => (d.weekday === weekday ? patch(d) : d));
    save.mutate(next, { onSuccess: () => toast({ text: msg, undo: () => save.mutateAsync(prev).then(() => undefined) }), onError: fail(toast) });
  };

  return (
    <>
      <section className="av-card" aria-labelledby="av-weekly-h">
        <h2 className="av-h" id="av-weekly-h">每週可預約時間</h2>
        <p className="av-sub">設定每週固定的上課時段，學生會依此預約。</p>
        <ul className="av-days">
          {WEEK_ORDER.map((w) => {
            const d = av.weekly.find((x) => x.weekday === w)!;
            const slots = d.ranges.flatMap((r) => startsInRange(r, lessonMinutes, gapMinutes));
            const problems = d.enabled ? rangeProblems(d.ranges, lessonMinutes) : [];
            return (
              <li key={w} className={`av-day${d.enabled ? '' : ' off'}`}>
                <div className="av-day-head">
                  <span className="av-day-name" id={`av-d-${w}`}>{WEEKDAY_LABEL[w]}</span>
                  <button className="switch" role="switch" aria-checked={d.enabled} aria-labelledby={`av-d-${w}`}
                    onClick={() => commit(w, (x) => ({
                      ...x, enabled: !x.enabled,
                      // first time ON with no hours: start from a sensible default instead of an empty day
                      ranges: !x.enabled && x.ranges.length === 0 ? [{ start: '10:00', end: '18:00' }] : x.ranges,
                    }), `${WEEKDAY_LABEL[w]}${d.enabled ? '不開放預約' : '開放預約'}`)} />
                </div>
                {d.enabled ? (
                  <div className="av-day-body">
                    <div className="av-ranges">
                      {d.ranges.map((r, i) => (
                        <span className="av-range" key={`${r.start}-${r.end}`}>
                          <Link to={`range/${w}/${i}`} className="av-range-edit" aria-label={`編輯${WEEKDAY_LABEL[w]} ${rangeText(r)}`}>{rangeText(r)}</Link>
                          <button className="av-range-del" aria-label={`刪除${WEEKDAY_LABEL[w]} ${rangeText(r)}`}
                            onClick={() => commit(w, (x) => ({ ...x, ranges: x.ranges.filter((_, j) => j !== i), enabled: x.ranges.length > 1 }), `已刪除 ${WEEKDAY_LABEL[w]} ${rangeText(r)}`)}>
                            <Icon name="trash" size={16} /></button>
                        </span>
                      ))}
                      <Link to={`range/${w}/new`} className="av-add"><Icon name="plus" size={16} />新增時段</Link>
                    </div>
                    {problems.length > 0
                      ? <p className="av-warn">{problems[0]}</p>
                      : <p className="av-preview">{slots.length ? `可預約 ${slots.length} 堂：${slots.join('、')}` : '這天排不出任何時段。'}</p>}
                  </div>
                ) : <p className="av-off">不開放預約</p>}
              </li>
            );
          })}
        </ul>
        <p className="av-info"><Icon name="info" size={16} /><span>系統依「每堂課時長」與「課程間隔」自動產生時段，已被預約的時間不會出現。例如 10:00 – 13:00（每堂 {lessonMinutes} 分鐘、間隔 {gapMinutes} 分鐘）→ {startsInRange({ start: '10:00', end: '13:00' }, lessonMinutes, gapMinutes).join('、') || '排不進課'}。</span></p>
      </section>

      <button className="av-link-card" onClick={() => onGo('settings')}>
        <Icon name="gear" size={22} />
        <span><b>預約設定</b><small>每堂課 {lessonMinutes} 分鐘 · 間隔 {gapMinutes} 分鐘 · 可約 {advanceDays} 天內</small></span>
        <Icon name="chev" size={18} />
      </button>
      <button className="av-link-card" onClick={() => onGo('dates')}>
        <Icon name="calendar" size={22} />
        <span><b>特殊日期</b><small>{av.overrides.filter((o) => o.date >= studioToday()).length ? `已設定 ${av.overrides.filter((o) => o.date >= studioToday()).length} 天` : '設定例外的日期（休息或調整時段）'}</small></span>
        <Icon name="chev" size={18} />
      </button>
    </>
  );
}

/** Add / edit one weekly range. Route: range/:weekday/:idx ("new" to add). */
export function RangeSheet() {
  const { weekday, idx } = useParams();
  const av = useAvailability();
  const save = useSaveWeekly();
  const toast = useToast();
  const nav = useNavigate();
  const w = Number(weekday);
  const day = av.data?.weekly.find((x) => x.weekday === w);
  const editing = idx !== 'new' ? Number(idx) : null;
  const current = editing !== null ? day?.ranges[editing] : undefined;
  const [start, setStart] = useState(current?.start ?? '10:00');
  const [end, setEnd] = useState(current?.end ?? '12:00');
  if (!av.data || !day || (editing !== null && !current)) return null;

  const { lessonMinutes, gapMinutes } = av.data.settings;
  const others = day.ranges.filter((_, i) => i !== editing);
  const nextRanges = sortRanges([...others, { start, end }]);
  const problems = rangeProblems(nextRanges, lessonMinutes);
  const preview = startsInRange({ start, end }, lessonMinutes, gapMinutes);

  const submit = () => {
    const prev = av.data!.weekly;
    const next = prev.map((d) => (d.weekday === w ? { ...d, enabled: true, ranges: nextRanges } : d));
    save.mutateAsync(next)
      .then(() => toast({ text: `${WEEKDAY_LABEL[w]} ${start} – ${end} 已${editing === null ? '新增' : '更新'}`, undo: () => save.mutateAsync(prev).then(() => undefined) }))
      .catch(fail(toast));
    nav(-1);
  };

  return (
    <RouteSheet title={`${editing === null ? '新增時段' : '編輯時段'} · ${WEEKDAY_LABEL[w]}`}>
      <TimePair start={start} end={end} setStart={setStart} setEnd={setEnd} idPrefix="rs" />
      {problems.length > 0
        ? <p className="av-warn" role="alert">{problems[0]}</p>
        : <p className="av-preview" aria-live="polite">這段可以排 {preview.length} 堂：{preview.join('、')}</p>}
      <button className="btn primary block" disabled={problems.length > 0} onClick={submit}>{editing === null ? '新增' : '儲存'}</button>
      <button className="btn secondary block" onClick={() => nav(-1)}>取消</button>
    </RouteSheet>
  );
}

function TimePair({ start, end, setStart, setEnd, idPrefix }: { start: string; end: string; setStart: (v: string) => void; setEnd: (v: string) => void; idPrefix: string }) {
  return (
    <div className="av-pair">
      <div className="field"><label htmlFor={`${idPrefix}-s`}>開始</label>
        <select id={`${idPrefix}-s`} className="input" value={start} onChange={(e) => setStart(e.target.value)}>{TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select></div>
      <span className="av-dash" aria-hidden="true">–</span>
      <div className="field"><label htmlFor={`${idPrefix}-e`}>結束</label>
        <select id={`${idPrefix}-e`} className="input" value={end} onChange={(e) => setEnd(e.target.value)}>{TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}</select></div>
    </div>
  );
}

/* ---------- 特殊日期 ---------- */
function DatesPanel({ av }: { av: Availability }) {
  const del = useDeleteOverride();
  const save = useSaveOverride();
  const toast = useToast();
  const today = studioToday();
  const upcoming = av.overrides.filter((o) => o.date >= today);
  const remove = (o: DateOverride) =>
    del.mutate(o.date, { onSuccess: () => toast({ text: `已刪除 ${fmtDate(o.date)} 的特殊設定`, undo: () => save.mutateAsync(o).then(() => undefined) }), onError: fail(toast) });

  return (
    <section className="av-card" aria-labelledby="av-dates-h">
      <h2 className="av-h" id="av-dates-h">特殊日期</h2>
      <p className="av-sub">某一天休息或想改時間，就在這裡設定。這天會取代每週時段。</p>
      <Link to="date/new" className="btn primary av-add-date"><Icon name="plus" size={18} />新增特殊日期</Link>
      {upcoming.length === 0 ? <p className="av-empty">還沒有特殊日期。</p> : (
        <ul className="av-overrides">{upcoming.map((o) => (
          <li key={o.date}>
            <Link to={`date/${o.date}`} className="av-ov-main" aria-label={`編輯 ${fmtDate(o.date)}`}>
              <span className="av-ov-date">{fmtDate(o.date)}</span>
              <span className={`av-ov-tag ${o.closed ? 'closed' : 'custom'}`}>{o.closed ? '全天休息' : '自訂時段'}</span>
              <span className="av-ov-detail">{o.closed ? (o.note || '這天不開放預約') : `${o.ranges.map(rangeText).join('、')}${o.note ? ` · ${o.note}` : ''}`}</span>
            </Link>
            <button className="icon-btn flat hit" aria-label={`刪除 ${fmtDate(o.date)} 的特殊設定`} onClick={() => remove(o)}><Icon name="trash" size={18} /></button>
          </li>))}</ul>
      )}
    </section>
  );
}

/** Add / edit a special date. Route: date/:date ("new" to add). */
export function OverrideSheet() {
  const { date: param } = useParams();
  const av = useAvailability();
  const save = useSaveOverride();
  const toast = useToast();
  const nav = useNavigate();
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
  const weekly = date ? av.data.weekly.find((w) => w.weekday === weekdayOf(date)) : undefined;
  const problems = closed ? [] : ranges.length === 0 ? ['請至少加一個時段，或改成全天休息。'] : rangeProblems(ranges, lessonMinutes);
  const replacing = param === 'new' && date ? av.data.overrides.some((o) => o.date === date) : false;
  const ready = !!date && date >= today && problems.length === 0;
  const setRange = (i: number, r: TimeRange) => setRanges(ranges.map((x, j) => (j === i ? r : x)));

  const submit = () => {
    const o: DateOverride = { date, closed, ranges: closed ? [] : sortRanges(ranges), note: note.trim() };
    save.mutateAsync(o).then(() => toast({ text: `${fmtDate(date)} 已設定為${closed ? '全天休息' : '自訂時段'}` })).catch(fail(toast));
    nav(-1);
  };

  return (
    <RouteSheet title={existing ? `編輯 ${fmtDate(existing.date)}` : '新增特殊日期'}>
      {!existing && (
        <div className="field"><label htmlFor="ov-date">日期</label>
          <input id="ov-date" className="input" type="date" min={today} max={undefined} value={date} onChange={(e) => setDate(e.target.value)} />
          {date && weekly && <p className="av-hint">平常{WEEKDAY_LABEL[weekly.weekday]}：{weekly.enabled ? weekly.ranges.map(rangeText).join('、') : '不開放預約'}</p>}
          {replacing && <p className="av-hint">這天已經有特殊設定，儲存後會取代。</p>}
        </div>
      )}
      <fieldset className="av-fs"><legend>這天要</legend>
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
          {problems.length > 0
            ? <p className="av-warn" role="alert">{problems[0]}</p>
            : <p className="av-preview">這天可預約：{ranges.flatMap((x) => startsInRange(x, lessonMinutes, gapMinutes)).sort().join('、') || '沒有時段'}</p>}
        </div>
      )}
      <div className="field"><label htmlFor="ov-note">備註（選填）</label>
        <input id="ov-note" className="input" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：參加音樂會" /></div>
      {booked.length > 0 && (
        <p className="av-booked" role="note">
          這天已有 {booked.length} 堂課（{booked.map((l) => `${l.time} ${l.studentName}`).join('、')}）。特殊日期只影響之後的預約，<b>不會自動取消這些課</b>，需要的話請到行事曆處理。
        </p>
      )}
      <button className="btn primary block" disabled={!ready} onClick={submit}>儲存</button>
      <button className="btn secondary block" onClick={() => nav(-1)}>取消</button>
    </RouteSheet>
  );
}

/* ---------- 預約設定 ---------- */
function SettingsPanel({ s }: { s: BookingSettings }) {
  const save = useSaveBookingSettings();
  const toast = useToast();
  const set = (patch: Partial<BookingSettings>, msg: string) => {
    const prev = s;
    save.mutate({ ...s, ...patch }, { onSuccess: () => toast({ text: msg, undo: () => save.mutateAsync(prev).then(() => undefined) }), onError: fail(toast) });
  };
  const row = (id: string, label: string, hint: string, value: number, opts: number[], fmt: (n: number) => string, key: keyof BookingSettings) => (
    <div className="av-set">
      <div><label htmlFor={id}>{label}</label><p className="av-hint">{hint}</p></div>
      <select id={id} className="input" value={value} onChange={(e) => set({ [key]: Number(e.target.value) }, `${label}改為 ${fmt(Number(e.target.value))}`)}>
        {opts.map((n) => <option key={n} value={n}>{fmt(n)}</option>)}
      </select>
    </div>
  );
  return (
    <section className="av-card" aria-labelledby="av-set-h">
      <h2 className="av-h" id="av-set-h">預約設定</h2>
      <p className="av-sub">改了之後，學生看到的時段會馬上更新。已經預約的課不受影響。</p>
      <div className="av-sets">
        {row('set-len', '每堂課時長', '新預約的課有多長', s.lessonMinutes, LESSON_OPTS, (n) => `${n} 分鐘`, 'lessonMinutes')}
        {row('set-gap', '課程間隔', '兩堂課之間休息多久', s.gapMinutes, GAP_OPTS, (n) => (n === 0 ? '不休息' : `${n} 分鐘`), 'gapMinutes')}
        {row('set-adv', '可提前預約', '學生最遠可以預約到幾天後', s.advanceDays, ADVANCE_OPTS, (n) => `${n} 天內`, 'advanceDays')}
      </div>
    </section>
  );
}
