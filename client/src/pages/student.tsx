import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { useCurrentUser } from '../components/Shell';
import { RouteSheet } from '../components/Sheet';
import { SlotPicker } from '../components/SlotPicker';
import { useToast } from '../components/Toast';
import { DateBox, Empty, ErrorCard, ListSkeleton, PageHead, PageSkeleton, Quota, Tag } from '../components/ui';
import { ApiError, newIdempotencyKey } from '../lib/api';
import { compareSlot, fmtDate, fmtMoney, fmtRelative, fmtSlot, monthGrid, studioToday, dayNum, initialOf, fmtDuration, LESSON_TYPE_LABEL } from '../lib/date';
import { monthRange } from '../lib/prefetch';
import {
  useAlerts, useAnswerProposal, useAskMove, useBook, useCancelLesson, useDays, useLessons, useMarkAllRead, useMyPayments, useStudio,
  useLogout, useUpdateProfile, useUploadReceipt, useWithdrawMove,
} from '../lib/queries';
import type { AlertKind, Lesson, Me } from '../lib/types';

const greeting = () => { const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: 'numeric', hour12: false }).format(new Date())); return h < 11 ? '早安' : h < 18 ? '午安' : '晚安'; };
const firstName = (n: string) => (n.length >= 3 ? n.slice(1) : n);

function useMyLessons() {
  const [from, to] = monthRange();
  return useLessons('student', from, to);
}
function lessonTag(l: Lesson) {
  if (l.status === 'Attended') return <Tag tone="grey">已上課</Tag>;
  if (l.status === 'Cancelled') return <Tag tone="bad">已取消</Tag>;
  if (l.change) return <Tag tone="warn">{l.change.by === 'teacher' ? '等你回覆' : '等待老師回覆'}</Tag>;
  return <Tag tone="ok">已確認</Tag>;
}

/* =================== Home =================== */
/** "今天上課 / 明天上課 / 3 天後上課" — counts calendar days in studio time. */
function untilLabel(date: string, today: string): string {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
  return days <= 0 ? '今天上課' : days === 1 ? '明天上課' : `${days} 天後上課`;
}

/** ms timestamp when a lesson starts (studio time is UTC+8) */
const startOf = (l: { date: string; time: string }) => new Date(`${l.date}T${l.time}:00+08:00`).getTime();
/** 改時間 closes moveHours (12) before the lesson — after that the student can only cancel */
function useCanMove(l: Lesson | undefined) {
  const studio = useStudio();
  const hours = studio.data?.moveHours ?? 12;
  return { canMove: !!l && startOf(l) - Date.now() >= hours * 36e5, hours };
}

/** ••• menu for one lesson: the less common actions live here so they don't compete with the main ones. */
function LessonMenu({ l }: { l: Lesson }) {
  const [open, setOpen] = useState(false);
  const { canMove, hours } = useCanMove(l);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const id = `lm-${l.id}`;
  return (
    <div className="sh-menu" ref={ref}>
      <button className="icon-btn flat hit" aria-label={`${fmtSlot(l.date, l.time)} 的更多動作`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><Icon name="more" /></button>
      {open && (
        <div className="sh-pop" id={id}>
          {!l.change && (canMove
            ? <Link to={`/app/lessons/${l.id}/move`} viewTransition onClick={() => setOpen(false)}>改時間</Link>
            : <span className="sh-pop-off" aria-disabled="true">改時間<small>上課前 {hours} 小時內不能改</small></span>)}
          <Link to={`lessons/${l.id}/cancel`} className="danger" onClick={() => setOpen(false)}>取消預約</Link>
        </div>
      )}
    </div>
  );
}

/**
 * 老師提議改時間 — Iris can't move a lesson on her own (decided 8 Nov), so she proposes and the student answers here.
 * It sits at the top of home: it is the only thing on the screen that waits for the student.
 */
function ProposalCard({ l }: { l: Lesson }) {
  const answer = useAnswerProposal();
  const toast = useToast();
  const c = l.change!;
  const reply = (accept: boolean) => answer.mutateAsync({ id: c.id, accept })
    .then(() => toast({ text: accept ? `已改到 ${fmtSlot(c.toDate, c.toTime)}` : '已回覆老師：不方便。課程維持原時間。' }))
    .catch((e) => toast({ text: (e as Error).message, kind: 'error' }));
  return (
    <section className="sh-card sh-prop" aria-labelledby={`prop-${l.id}`}>
      <p className="overline" id={`prop-${l.id}`}><Icon name="repeat" size={14} weight="bold" /> 老師想調整上課時間</p>
      <p className="sh-prop-time">
        <span className="sh-prop-old"><span className="sr-only">原時段 </span>{fmtSlot(l.date, l.time)}</span>
        <span aria-hidden="true">→</span>
        <b><span className="sr-only">改到 </span>{fmtSlot(c.toDate, c.toTime)}</b>
      </p>
      {c.reason && <p className="sh-prop-msg">老師：「{c.reason}」</p>}
      <p className="sh-prop-note">你同意後才會改。不方便的話，原本的時段會保留。</p>
      <div className="sh-prop-actions">
        <button className="btn secondary" disabled={answer.isPending} onClick={() => reply(false)}>不方便</button>
        <button className="btn primary" disabled={answer.isPending} onClick={() => reply(true)}>可以，改到這個時間</button>
      </div>
    </section>
  );
}

export function StudentHome() {
  const me = useCurrentUser();
  const lessons = useMyLessons();
  const today = studioToday();
  const upcoming = useMemo(() => (lessons.data ?? []).filter((l) => l.status === 'Booked' && l.date >= today).sort(compareSlot), [lessons.data, today]);
  const next = upcoming[0];
  const others = upcoming.slice(1); // the next class is already the hero — don't list it twice
  const proposals = upcoming.filter((l) => l.change?.by === 'teacher');
  const { canMove: nextCanMove } = useCanMove(next);

  return (
    <>
      <PageHead title={`${greeting()}，${firstName(me.name)}`} over={fmtDate(today)}
        right={<Link to="/app/alerts" className="icon-btn mobile-only sh-bell" aria-label={`通知${me.unreadAlerts ? '，有未讀' : ''}`} viewTransition><Icon name="bell" />{me.unreadAlerts > 0 && <span className="sh-dot" aria-hidden="true" />}</Link>} />
      {lessons.isPending ? <PageSkeleton blocks={[160, 200]} /> : lessons.isError ? <ErrorCard error={lessons.error} retry={lessons.refetch} /> : (
        <div className="sh">
          {/* 0. Iris is waiting for an answer */}
          {proposals.map((l) => <ProposalCard key={l.id} l={l} />)}
          {/* 1. next class */}
          <section className="sh-card sh-next" aria-labelledby="next-t">
            <p className="overline" id="next-t">下一堂課</p>
            {next ? (
              <>
                <p className="sh-until">{untilLabel(next.date, today)}</p>
                <div className="sh-when">
                  <DateBox date={next.date} />
                  <div className="sh-when-text">
                    <p className="sh-time">{fmtSlot(next.date, next.time)}</p>
                    <p className="sh-meta">{fmtDuration(next.minutes)} · {LESSON_TYPE_LABEL[next.type]}</p>
                    <p className="sh-meta">{next.room}</p>
                  </div>
                </div>
                {next.change
                  ? <p className="sh-status wait">{next.change.by === 'teacher'
                    ? `● 老師提議改到 ${fmtSlot(next.change.toDate, next.change.toTime)} · 請在上方回覆`
                    : `● 申請改到 ${fmtSlot(next.change.toDate, next.change.toTime)} · 等待老師回覆`}</p>
                  : <p className="sh-status ok">● 已確認</p>}
                <div className="sh-actions">
                  {!next.change && nextCanMove && <Link to={`/app/lessons/${next.id}/move`} className="btn secondary sh-move" viewTransition><Icon name="repeat" size={18} />改時間</Link>}
                  <Link to={`lessons/${next.id}/cancel`} className="sh-cancel" aria-label={`取消預約：${fmtSlot(next.date, next.time)}`}>取消預約</Link>
                </div>
              </>
            ) : <Empty text="還沒有預約的課。" action={<Link to="/app/book" className="btn primary" viewTransition>預約課程</Link>} />}
          </section>

          {/* 2. balance */}
          <QuotaCard me={me} withBook />

          {/* 3. later reservations */}
          {others.length > 0 && (
            <section className="sh-card" aria-labelledby="others-t">
              <p className="overline" id="others-t">其他預約 · {others.length}</p>
              <ul className="sh-list">{others.map((l) => (
                <li key={l.id}>
                  <div className="sh-li-text">
                    <p className="sh-li-time">{fmtSlot(l.date, l.time)}</p>
                    {l.change
                      ? <><p className="sh-li-sub">{l.change.by === 'teacher' ? '老師提議改到' : '申請改到'} {fmtSlot(l.change.toDate, l.change.toTime)}</p><p className="sh-status wait">● {l.change.by === 'teacher' ? '等你回覆' : '等待老師回覆'}</p></>
                      : <p className="sh-li-sub">{fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]}</p>}
                  </div>
                  <LessonMenu l={l} />
                </li>))}</ul>
            </section>
          )}
        </div>
      )}
      <Outlet />
    </>
  );
}

/**
 * 我的堂數. Hierarchy: remaining number → credit boxes → legend (meaning) → 預約課程 → history link.
 * Deliberately not uniform: the number is heavy while its words are light, boxes are bigger than chips elsewhere,
 * the history link sits left-aligned as plain text, and spacing steps 24 / 16 / 32 / 16 rather than one gap everywhere.
 */
function QuotaCard({ me, withBook }: { me: Me; withBook?: boolean }) {
  const total = Math.max(me.packageSize, me.attended + me.booked + me.credits);
  const attended = Math.max(0, Math.min(me.attended, total - me.booked - me.credits));
  return (
    <section className="card quota-card" aria-labelledby="quota-t">
      <p className="overline" id="quota-t">我的堂數</p>
      <p className="qc-remaining"><span>剩餘</span><b>{me.credits}</b><span>堂</span></p>
      <div className="qc-boxes"><Quota attended={attended} booked={me.booked} free={me.credits} /></div>
      <ul className="qc-legend" aria-label="圖示說明">
        <li><span className="qc-key a" aria-hidden="true"><Icon name="check" size={12} weight="bold" /></span>已上課</li>
        <li><span className="qc-key b" aria-hidden="true">●</span>已預約</li>
        <li><span className="qc-key f" aria-hidden="true">○</span>可預約</li>
      </ul>
      {withBook && (me.credits > 0
        ? <Link to="/app/book" className="btn primary block qc-book" viewTransition><Icon name="book" size={20} />預約課程</Link>
        : <div className="stack g2 qc-book-wrap"><button className="btn primary block qc-book" disabled>預約課程</button><p className="caption">{me.trialAvailable ? <>先購買體驗課，就可以預約。<Link to="/app/quota">購買體驗課</Link></> : <>堂數已用完。<Link to="/app/quota">上傳匯款證明購買新方案</Link></>}</p></div>)}
      {withBook && <Link to="/app/quota" className="qc-history" viewTransition>查看堂數與付款紀錄<Icon name="arrow" size={16} /></Link>}
    </section>
  );
}

/* =================== Cancel (sheet route) =================== */
export function CancelSheet() {
  const { id } = useParams();
  const lessons = useMyLessons();
  const studio = useStudio();
  const { cancel, undo } = useCancelLesson();
  const toast = useToast();
  const nav = useNavigate();
  const l = lessons.data?.find((x) => x.id === id);
  if (!l) return null;
  const start = new Date(`${l.date}T${l.time}:00+08:00`).getTime();
  const refund = start - Date.now() >= (studio.data?.cancelHours ?? 24) * 36e5;

  return (
    <RouteSheet title="取消這堂課？" dismissible={!cancel.isPending}>
      <div className="inner stack g1"><p className="t">{fmtSlot(l.date, l.time)}</p><p className="caption">{fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]} · {l.room}</p></div>
      <div className={`notice${refund ? '' : ' quiet'}`}><Icon name={refund ? 'check' : 'info'} />
        <span>{refund ? <><b>堂數會退回。</b>距離上課超過 24 小時。</> : <><b>堂數不會退回。</b>距離上課不到 24 小時。</>}</span></div>
      {cancel.isError && <div className="notice error" role="alert"><Icon name="info" /><span>{(cancel.error as Error).message}</span></div>}
      <button className="btn danger block" disabled={cancel.isPending}
        onClick={() => cancel.mutate(l.id, {
          onSuccess: (r) => {
            nav('/app', { replace: true });
            toast({ text: `已取消 ${fmtDate(l.date)}${r.refunded ? '，堂數已退回 1 堂' : ''}`, undo: async () => { await undo(l.id); } });
          },
        })}>
        {cancel.isPending ? '取消中…' : `取消 ${fmtDate(l.date)} 的課`}
      </button>
      <button className="btn secondary block" disabled={cancel.isPending} onClick={() => nav(-1)}>保留這堂課</button>
    </RouteSheet>
  );
}

/* =================== Book =================== */
export function Book() {
  const me = useCurrentUser();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [onlyFree, setOnlyFree] = useState(false);
  const today = studioToday();
  const days = useDays(addDaysSafe(today, -1));
  const firstOpen = days.data?.find((d) => d.state === 'open')?.date ?? null;
  const date = sp.get('date') ?? firstOpen;
  const time = sp.get('time');
  const setDate = (d: string) => setSp({ date: d }, { replace: true });
  const setTime = useCallback((t: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (t) n.set('time', t); else n.delete('time'); if (!n.get('date') && date) n.set('date', date); return n; }, { replace: true }), [setSp, date]);
  const ready = !!date && !!time && me.credits > 0;
  const label = date && time ? fmtSlot(date, time) : '';
  const lessonMinutes = useStudio().data?.lessonMinutes ?? 60; // from Iris's 預約設定

  return (
    <>
      <PageHead title="預約課程" over={`剩餘 ${me.credits} 堂`} back />
      <div className="split">
        <section className="card">
          <SlotPicker date={date} time={time} onDate={setDate} onTime={setTime} onlyFree={onlyFree} setOnlyFree={setOnlyFree} />
        </section>
        <div className="stack g4">
          <section className={`card bk-sum${date && time ? ' is-ready' : ''}`} aria-live="polite">
            <p className="overline">預約明細</p>
            {date && time ? (
              <>
                <p className="bk-when">{label}</p>
                <p className="bk-meta">{fmtDuration(lessonMinutes)} · {LESSON_TYPE_LABEL.private}</p>
                <p className="bk-left">預約後剩餘 <b>{Math.max(me.credits - 1, 0)}</b> 堂 <span>（使用 1 堂）</span></p>
              </>
            ) : <p className="caption">{date ? '再選一個時段。' : '請選擇日期和時段。'}</p>}
            {me.credits <= 0 && <p className="caption" style={{ color: 'var(--bad)' }}>堂數已用完，請先<Link to="/app/quota">購買新方案</Link>。</p>}
          </section>
          <div className="notice quiet"><Icon name="info" /><span>上課前 24 小時以上取消，使用的堂數將退回。</span></div>
          <div className="sticky-cta">
            <button className="btn primary block" disabled={!ready}
              onClick={() => nav(`confirm?date=${date}&time=${time}`)}>
              <Icon name="book" size={18} />{me.credits <= 0 ? '堂數已用完' : ready ? '確認預約' : '請選擇時段'}
            </button>
          </div>
        </div>
      </div>
      <Outlet />
    </>
  );
}
function addDaysSafe(d: string, n: number) { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); }

/** Confirm sheet: the idempotency key is created when the sheet opens, so a double tap or retry books once (#19). */
export function BookConfirm() {
  const [sp] = useSearchParams();
  // Freeze the slot when the sheet opens. After booking, the slot list refreshes, the slot becomes "full" and the
  // booking page clears ?time= from the URL; reading it live would then show "null".
  const [{ date, time }] = useState(() => ({ date: sp.get('date')!, time: sp.get('time')! }));
  const me = useCurrentUser();
  const lessonMinutes = useStudio().data?.lessonMinutes ?? 60;
  const [key] = useState(newIdempotencyKey);
  const book = useBook();
  const nav = useNavigate();
  const toast = useToast();
  const label = fmtSlot(date, time);

  if (book.isSuccess) return (
    <RouteSheet title="預約成功" onClose={() => nav('/app', { replace: true })}>
      <div className="stack g3" style={{ alignItems: 'center', textAlign: 'center' }}>
        <span className="ico" style={{ width: 56, height: 56, background: 'var(--sage-700)', color: '#fff' }}><Icon name="check" size={28} /></span>
        <div className="stack g1">
          <p className="t" style={{ fontSize: 17, lineHeight: '24px' }}>{fmtSlot(book.data.lesson.date, book.data.lesson.time)}</p>
          <p style={{ margin: 0 }}>{fmtDuration(book.data.lesson.minutes)} · {LESSON_TYPE_LABEL[book.data.lesson.type]}</p>
          <p className="caption" style={{ marginTop: 4 }}>剩餘 {book.data.creditsLeft} 堂</p>
        </div>
      </div>
      <button className="btn primary block" onClick={() => { nav('/app', { replace: true }); toast({ text: '已預約，課程已加到行事曆' }); }}>回到首頁</button>
    </RouteSheet>
  );

  const taken = book.error instanceof ApiError && book.error.code === 'slot_taken';
  return (
    <RouteSheet title="確認預約" dismissible={!book.isPending}>
      <dl className="dl" style={{ fontSize: 'var(--fs-body)', lineHeight: '24px' }}>
        <dt>日期時間</dt><dd>{label}</dd><dt>課程</dt><dd>{fmtDuration(lessonMinutes)} · {LESSON_TYPE_LABEL.private}</dd><dt>使用課堂</dt><dd>1 堂</dd><dt>預約後剩餘</dt><dd>{Math.max(me.credits - 1, 0)} 堂</dd>
      </dl>
      {book.isError && <div className="notice error" role="alert"><Icon name="info" /><span>{(book.error as Error).message}</span></div>}
      {!taken && (
        <button className="btn primary block" disabled={book.isPending} onClick={() => book.mutate({ date, time, key })}>
          {book.isPending ? '預約中…' : book.isError ? '再試一次' : '確認預約'}
        </button>
      )}
      <button className="btn secondary block" disabled={book.isPending}
        onClick={() => (taken ? nav(`/app/book?date=${date}`, { replace: true }) : nav(-1))}>{taken ? '選擇其他時段' : '再想想'}</button>
    </RouteSheet>
  );
}

/* =================== Move =================== */
export function Move() {
  const { id } = useParams();
  const lessons = useMyLessons();
  const ask = useAskMove();
  const nav = useNavigate();
  const toast = useToast();
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const [reason, setReason] = useState('');
  const l = lessons.data?.find((x) => x.id === id);
  const { canMove, hours } = useCanMove(l);
  if (lessons.isPending) return <PageSkeleton />;
  if (!l) return <ErrorCard error={new Error('找不到這堂課。')} />;
  if (!canMove) return (
    <>
      <PageHead title="申請改時間" back />
      <div className="notice" role="alert"><Icon name="info" /><span>上課前 {hours} 小時內不能改時間。如果無法上課，請<Link to={`/app/lessons/${l.id}/cancel`}>取消預約</Link>。</span></div>
    </>
  );
  const onTime = (t: string | null) => setTime(t);

  return (
    <>
      <PageHead title="申請改時間" back />
      <div className="inner"><p className="overline" style={{ marginBottom: 8 }}>目前時段</p>
        <div className="row"><div className="grow stack g1"><p className="t">{fmtSlot(l.date, l.time)}</p><p className="caption">{l.room}</p></div><Tag tone="ok">已確認</Tag></div></div>
      <form className="stack g4" onSubmit={(e) => { e.preventDefault(); if (!date || !time) return;
        ask.mutate({ lessonId: l.id, date, time, reason }, { onSuccess: () => { nav('/app', { replace: true, viewTransition: true }); toast({ text: '已送出申請，等待老師回覆' }); } }); }}>
        <section className="card">
          <SlotPicker date={date} time={time} onDate={(d) => { setDate(d); setTime(null); }} onTime={onTime} onlyFree={onlyFree} setOnlyFree={setOnlyFree} exclude={{ date: l.date, time: l.time }} />
          <div className="field"><label htmlFor="why">原因（老師會看到）</label><textarea id="why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></div>
        </section>
        <div className="notice"><Icon name="info" /><span>老師確認前，原本的時段會幫你保留。改時間不會扣堂數。</span></div>
        {ask.isError && <div className="notice error" role="alert"><Icon name="info" /><span>{(ask.error as Error).message}</span></div>}
        <button className="btn primary block" disabled={!date || !time || ask.isPending}>{ask.isPending ? '送出中…' : date && time ? `申請改到 ${fmtSlot(date, time)}` : '請選擇新時段'}</button>
      </form>
    </>
  );
}

/* =================== Calendar =================== */
export function StudentCalendar() {
  const lessons = useMyLessons();
  const withdraw = useWithdrawMove();
  const toast = useToast();
  const today = studioToday();
  const [view, setView] = useState<'month' | 'list'>('month');
  const [filter, setFilter] = useState<'past' | 'today' | 'up'>('up');
  const [ym, setYm] = useState(() => [Number(today.slice(0, 4)), Number(today.slice(5, 7))]);
  const [sel, setSel] = useState(today);
  const byDay = useMemo(() => { const m = new Map<string, Lesson[]>(); (lessons.data ?? []).filter((l) => l.status !== 'Cancelled').forEach((l) => m.set(l.date, [...(m.get(l.date) ?? []), l])); return m; }, [lessons.data]);
  const grid = monthGrid(ym[0], ym[1]);
  const shift = (d: number) => setYm(([y, m]) => { const t = m + d; return t < 1 ? [y - 1, 12] : t > 12 ? [y + 1, 1] : [y, t]; });
  const listed = (lessons.data ?? []).filter((l) => l.status !== 'Cancelled' && (filter === 'past' ? l.date < today : filter === 'today' ? l.date === today : l.date > today));
  if (filter === 'past') listed.reverse();

  const row = (l: Lesson) => (
    <div className="li" key={l.id}><DateBox date={l.date} />
      <div className="grow stack g1"><p className="t">{l.time} – {endTime(l.time)}</p><p className="caption">{l.change ? `${l.change.by === 'teacher' ? '老師提議改到' : '申請改到'} ${fmtSlot(l.change.toDate, l.change.toTime)}` : l.room}</p></div>
      {lessonTag(l)}
      {l.change?.by === 'student' && <button className="btn sm secondary" disabled={withdraw.isPending} onClick={() => withdraw.mutate(l.change!.id, { onSuccess: () => toast({ text: '已撤回改時間申請' }) })}>撤回</button>}
    </div>
  );

  return (
    <>
      <PageHead title="行事曆" over={`${ym[0]} 年 ${ym[1]} 月`} />
      <div className="seg" role="tablist" aria-label="檢視方式">
        <button role="tab" aria-selected={view === 'month'} onClick={() => setView('month')}>月</button>
        <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}>列表</button>
      </div>
      {lessons.isPending ? <PageSkeleton blocks={[320]} /> : view === 'month' ? (
        <div className="split">
          <section className="card" style={{ padding: 16 }}>
            <div className="row between"><button className="icon-btn flat" aria-label="上個月" onClick={() => shift(-1)}><Icon name="back" /></button>
              <p className="t">{ym[0]} 年 {ym[1]} 月</p><button className="icon-btn flat" aria-label="下個月" onClick={() => shift(1)}><Icon name="chev" /></button></div>
            <div className="cal">
              {['一', '二', '三', '四', '五', '六', '日'].map((w) => <span className="wd" key={w}>{w}</span>)}
              {grid.map((d) => {
                const ls = byDay.get(d) ?? [];
                const cls = ls.some((l) => l.change) ? 'warn' : ls.length ? (d < today ? 'past' : 'up') : '';
                return (
                  <button key={d} className={`${d.slice(5, 7) !== String(ym[1]).padStart(2, '0') ? 'out' : ''}${d === today ? ' today' : ''}`}
                    aria-pressed={sel === d} aria-label={`${fmtDate(d)}${ls.length ? `，${ls.length} 堂課` : ''}`} onClick={() => setSel(d)}>
                    <span>{dayNum(d)}</span><i className={cls} />
                  </button>
                );
              })}
            </div>
            <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}><Tag tone="accent">即將上課</Tag><Tag tone="grey">已上課</Tag><Tag tone="warn">改時間中</Tag></div>
          </section>
          <section className="card"><p className="overline">{fmtDate(sel)}</p>
            {(byDay.get(sel) ?? []).length ? <div className="list">{byDay.get(sel)!.map(row)}</div> : <Empty text="這天沒有課。" action={sel >= today ? <Link className="btn secondary sm" to={`/app/book?date=${sel}`}>預約這天</Link> : undefined} />}
          </section>
        </div>
      ) : (
        <>
          <div className="fchips" role="group" aria-label="篩選">
            {(['past', 'today', 'up'] as const).map((f) => <button key={f} className="fchip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{{ past: '過去', today: '今天', up: '即將' }[f]}</button>)}
          </div>
          <section className="card tight">{listed.length ? <div className="list">{listed.map(row)}</div> : <p className="caption" style={{ padding: '16px 0' }}>沒有課程。</p>}</section>
        </>
      )}
    </>
  );
}
const endTime = (t: string) => { const [h, m] = t.split(':').map(Number); const x = h * 60 + m + 45; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

/* =================== Quota & payments =================== */
export function QuotaPage() {
  const me = useCurrentUser();
  const studio = useStudio();
  const pays = useMyPayments();
  const upload = useUploadReceipt();
  const toast = useToast();
  // 體驗 students who haven't tried yet see only the trial; everyone else sees the normal packages
  const offered = studio.data?.packages.filter((p) => !!p.trial === me.trialAvailable) ?? [];
  const [picked, setPkg] = useState<number | null>(null);
  const pkg = picked ?? offered[0]?.size ?? 4;
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [key, setKey] = useState(newIdempotencyKey);
  const pending = pays.data?.some((p) => p.status === 'Pending');
  // buy any time (credits are added on top) — only blocked while a receipt is waiting
  const canBuy = !pending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData(); fd.set('packageSize', String(pkg)); fd.set('receipt', file); if (note) fd.set('note', note);
    upload.mutate({ form: fd, key }, { onSuccess: () => { toast({ text: '已送出，老師確認後會通知你' }); setFile(null); setNote(''); setKey(newIdempotencyKey()); } });
  };

  return (
    <>
      <PageHead title="堂數與付款" back />
      <div className="split">
        <div className="stack g4">
          <QuotaCard me={me} />
          <section className="card"><p className="overline">付款紀錄</p>
            {pays.isPending ? <ListSkeleton rows={2} /> : pays.data?.length ? (
              <div className="list">{pays.data.map((p) => (
                <div className="li" key={p.id}><div className="grow stack g1"><p className="t">{p.trial ? '體驗課 · ' : ''}{p.packageSize} 堂 · {fmtMoney(p.amount)}</p>
                  <p className="caption">{fmtRelative(p.uploadedAt)} 上傳{p.rejectReason ? ` · 退回原因：${p.rejectReason}` : ''}</p></div>
                  <Tag tone={p.status === 'Confirmed' ? 'ok' : p.status === 'Rejected' ? 'bad' : 'warn'}>{{ Confirmed: '已確認', Rejected: '已退回', Pending: '確認中' }[p.status]}</Tag></div>
              ))}</div>
            ) : <p className="caption">還沒有付款紀錄。</p>}
          </section>
        </div>
        <form className="card" onSubmit={submit}>
          <p className="overline">{me.trialAvailable ? '購買體驗課' : '購買新方案'}</p>
          <p className="caption">{me.trialAvailable ? '第一次上課：1 堂體驗課，老師確認收據後就可以預約。' : '隨時都可以購買，老師確認後，堂數會加在目前剩餘的堂數上。'}</p>
          <div className="list">{offered.map((p) => (
            <label className="li" key={p.size} style={{ cursor: canBuy ? 'pointer' : 'default' }}>
              <input type="radio" name="pkg" value={p.size} checked={pkg === p.size} disabled={!canBuy} onChange={() => setPkg(p.size)} style={{ width: 22, height: 22, accentColor: 'var(--sage-700)' }} />
              <span className="grow t">{p.trial ? `體驗課 · ${p.size} 堂` : `${p.size} 堂`}</span><span className="t">{fmtMoney(p.price)}</span>
            </label>))}</div>
          {studio.data && <div className="inner stack g1"><p className="caption">匯款帳號</p><p className="t">{studio.data.bank.name} · {studio.data.bank.account}</p><p className="caption">戶名 {studio.data.bank.holder}</p></div>}
          <div className="field"><label htmlFor="rc">匯款證明（JPG、PNG、WEBP，5 MB 以內）</label>
            <input id="rc" className="input" type="file" accept="image/jpeg,image/png,image/webp" disabled={!canBuy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ paddingTop: 10 }} /></div>
          <div className="field"><label htmlFor="nt">備註（選填）</label><input id="nt" className="input" value={note} disabled={!canBuy} onChange={(e) => setNote(e.target.value)} placeholder="例如：帳號末五碼" /></div>
          {upload.isError && <div className="notice error" role="alert"><Icon name="info" /><span>{(upload.error as Error).message}</span></div>}
          <button className="btn primary block" disabled={!canBuy || !file || upload.isPending}><Icon name="upload" size={18} />{upload.isPending ? '上傳中…' : '上傳匯款證明'}</button>
          {!canBuy && <p className="caption">已經有一張收據在等老師確認，確認後就可以再購買。</p>}
        </form>
      </div>
    </>
  );
}

/* =================== Alerts =================== */
const ALERT_ICON: Record<AlertKind, string> = { moved: 'repeat', approved: 'repeat', declined: 'repeat', payment: 'receipt', added: 'calendar', welcome: 'sparkle', cancelled: 'calendar', reminder: 'receipt', proposal: 'repeat' };
export function Alerts() {
  const alerts = useAlerts();
  const { mutation, undo } = useMarkAllRead();
  const toast = useToast();
  const unread = (alerts.data ?? []).filter((a) => !a.read).map((a) => a.id);
  return (
    <>
      <PageHead title="通知" right={<button className="btn secondary sm" disabled={!unread.length}
        onClick={() => mutation.mutate(unread, { onSuccess: () => toast({ text: '已全部標為已讀', undo: () => undo(unread) }), onError: () => toast({ text: '沒有成功，請再試一次。', kind: 'error' }) })}>全部標為已讀</button>} />
      {alerts.isPending ? <ListSkeleton /> : alerts.isError ? <ErrorCard error={alerts.error} retry={alerts.refetch} /> : (
        <section className="card tight">
          {alerts.data!.length === 0 ? <p className="caption" style={{ padding: '16px 0' }}>目前沒有通知。</p> : (
            <div className="list">{alerts.data!.map((a) => (
              <div className="li" key={a.id} style={{ alignItems: 'flex-start' }}>
                {a.read ? <span style={{ width: 8 }} aria-hidden="true" /> : <span className="dot-unread" style={{ marginTop: 16 }} role="img" aria-label="未讀" />}
                <span className="ico"><Icon name={ALERT_ICON[a.kind]} /></span>
                <div className="grow stack g1"><p className="t" style={{ fontWeight: a.read ? 400 : 600, color: a.read ? 'var(--muted)' : undefined }}>{a.title}</p>
                  <p className="caption" style={{ whiteSpace: 'pre-line' }}>{a.body}</p>
                  {a.kind === 'proposal' && <Link to="/app" className="sd-link" viewTransition>到首頁回覆 <span aria-hidden="true">→</span></Link>}
                  <p className="caption">{fmtRelative(a.createdAt)}</p></div>
              </div>))}</div>
          )}
        </section>
      )}
    </>
  );
}

/* =================== Profile =================== */
export function Profile() {
  const me = useCurrentUser();
  const logout = useLogout();
  const nav = useNavigate();
  const save = useUpdateProfile();
  const toast = useToast();
  const [f, setF] = useState({ name: me.name, phone: me.phone ?? '', email: me.email ?? '', lineId: me.lineId ?? '', voiceType: me.voiceType ?? '', goal: me.goal ?? '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <PageHead title="個人資料" />
      <div className="inner row" style={{ gap: 16 }}><span className="avatar lg">{initialOf(me.name)}</span>
        <div className="grow stack g1"><p className="h3">{me.name}</p><p className="caption">{me.lineLinked ? '透過 LINE 登入' : 'Email 登入'} · 程度 {me.grade ?? '未設定'}（老師設定）</p></div></div>
      <Link to="/app/quota" className="inner row between" style={{ textDecoration: 'none', color: 'inherit' }} viewTransition>
        <span className="stack g1"><span className="t">堂數與付款</span><span className="caption">剩餘 {me.credits} 堂 · 上傳匯款證明</span></span><Icon name="chev" />
      </Link>
      <form className="card" onSubmit={(e) => { e.preventDefault(); save.mutate(f, { onSuccess: () => toast({ text: '已儲存' }), onError: (er) => toast({ text: (er as Error).message, kind: 'error' }) }); }}>
        {/* #15: autocomplete lets the phone fill these in */}
        <div className="field"><label htmlFor="p-name">姓名</label><input id="p-name" className="input" autoComplete="name" required value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="p-tel">電話</label><input id="p-tel" className="input" type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={set('phone')} /></div>
        <div className="field"><label htmlFor="p-mail">Email</label><input id="p-mail" className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} /></div>
        <div className="field"><label htmlFor="p-line">LINE ID</label><input id="p-line" className="input" autoComplete="off" value={f.lineId} onChange={set('lineId')} /></div>
        <div className="field"><label htmlFor="p-voice">聲部</label>
          <select id="p-voice" className="input" value={f.voiceType} onChange={set('voiceType')}><option value="">還不確定</option>{['女高音', '女中音', '女低音', '男高音', '男中音', '男低音'].map((v) => <option key={v}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="p-goal">學習目標</label><textarea id="p-goal" className="input" value={f.goal} onChange={set('goal')} maxLength={300} /></div>
        <button className="btn primary block" disabled={save.isPending}>{save.isPending ? '儲存中…' : '儲存'}</button>
      </form>
      <button className="btn ghost block mobile-only" onClick={() => { nav('/'); logout.mutate(); }}><Icon name="logout" size={18} />登出</button>
    </>
  );
}

