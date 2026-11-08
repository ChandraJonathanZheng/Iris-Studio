import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { inboxCount, useCurrentUser } from '../components/Shell';
import { RouteSheet } from '../components/Sheet';
import { SlotPicker } from '../components/SlotPicker';
import { TEACHER_STATUS_LABEL, TeacherStatusCard } from '../components/TeacherStatus';
import { useToast } from '../components/Toast';
import { BlurImage, Empty, ErrorCard, ListSkeleton, PageHead, PageSkeleton, Sk, Tag } from '../components/ui';
import { newIdempotencyKey } from '../lib/api';
import { addDays, CLASS_TYPE_LABEL, CONSULT_TIME_LABEL, compareSlot, dayNum, monthNum, wd, initialOf, fmtDate, fmtMoney, fmtRelative, fmtSlot, monthGrid, studioToday, studioNowTime, fmtDuration, LESSON_TYPE_LABEL } from '../lib/date';
import { monthRange } from '../lib/prefetch';
import {
  useAdjustCredits, useConsults, useDays, useLogout, useSetClassType, useDecideApplication, useDecideChange, useDecidePayment, useLessons, useMarkContacted,
  useOverview, usePayments, useProposals, useRequests, useSendReminder, useStudent, useStudents, useStudio, useMarkPrivacyDone, usePrivacyRequests, useTeacherAvatar, useTeacherAccount, useTeacherBook, useTeacherCancel, useTeacherProfile, useSaveTeacherProfile,
} from '../lib/queries';
import type { Lesson, Payment, PaymentStatus, PrivacyRequestType, StudentDetail, StudentSummary, TeacherProfile, TeacherPublic, TeacherStatus } from '../lib/types';

const greeting = () => { const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: 'numeric', hour12: false }).format(new Date())); return h < 11 ? '早安' : h < 18 ? '午安' : '晚安'; };
const initial = initialOf;

/**
 * One 今日待辦 card. Something waiting = amber edge + ◆ + number (shape and word, not colour alone);
 * zero = quiet: grey number, no mark — so Iris's eye goes only to the cards that need her.
 */
function Kpi({ to, title, icon, n, detail }: { to: string; title: string; icon: string; n: number; detail: string }) {
  return (
    <Link to={to} className={`kpi${n > 0 ? ' is-due' : ' is-clear'}`} viewTransition aria-label={`${title}：${n > 0 ? `${n} 件待處理` : '沒有待處理'}，${detail}`}>
      <span className="kt"><Icon name={icon} size={18} />{title}</span>
      <span className="kn"><span className="big">{n}</span>{n > 0 && <span className="kpi-due">◆ 待處理</span>}</span>
      <span className="kd">{detail}</span>
    </Link>
  );
}

/* =================== Home =================== */
export function TeacherHome() {
  const me = useCurrentUser();
  const ov = useOverview();
  const today = studioToday();
  const c = ov.data?.counts;
  const open = inboxCount(c);
  return (
    <>
      <div className="stack g1 th-hello"><p className="overline">{fmtDate(today)}</p><h1 className="h1">{greeting()}，{me.name}</h1>
        <p className="caption">{ov.data ? `今天 ${ov.data.today.length} 堂課 · ${open ? `${open} 件待處理` : '沒有待處理的事'}` : ' '}</p></div>
      {ov.isPending ? <><div className="kpis">{[0, 1, 2, 3].map((i) => <Sk key={i} h={104} card />)}</div><ListSkeleton rows={3} /></>
        : ov.isError ? <ErrorCard error={ov.error} retry={ov.refetch} /> : (
        <>
          {/* order = what needs Iris first (今日待辦), then today's teaching, then students to follow up */}
          <section className="th-todo" aria-labelledby="th-todo-h">
            <h2 className="overline" id="th-todo-h">今日待辦</h2>
            <div className="kpis">
              <Kpi to="/teacher/requests" icon="repeat" title="改時間申請" n={c!.changes} detail={c!.changes ? '請確認新時段' : '沒有新的申請'} />
              <Kpi to="/teacher/payments" icon="receipt" title="待確認收據" n={c!.receipts} detail={c!.receipts ? `共 ${fmtMoney(c!.receiptsAmount)}` : '都已確認'} />
              <Kpi to="/teacher/requests?tab=apps" icon="user" title="新學生" n={c!.applications} detail={c!.applications ? '等待你確認帳號' : '沒有新的申請'} />
              <Kpi to="/teacher/consults" icon="msg" title="諮詢" n={c!.consults} detail={c!.consults ? '還沒聯絡' : '都已聯絡'} />
            </div>
          </section>
          <section className="card th-today" aria-labelledby="th-today-h">
            <div className="th-head"><h2 className="overline" id="th-today-h">今天的課</h2>
              <Link to="/teacher/calendar" className="th-more" viewTransition>查看完整行事曆 <span aria-hidden="true">→</span></Link></div>
            {ov.data!.today.length ? <TodayList lessons={ov.data!.today} /> : <p className="caption">今天沒有課。</p>}
          </section>
          <section className="card th-quota" aria-labelledby="th-quota-h">
            <div className="th-head"><h2 className="overline" id="th-quota-h">堂數用完</h2>
              {ov.data!.outOfQuota.length > 0 && <span className="th-count">{ov.data!.outOfQuota.length} 位</span>}</div>
            {ov.data!.outOfQuota.length ? <ul className="th-qlist">{ov.data!.outOfQuota.map((s) => <QuotaRow key={s.id} s={s} />)}</ul> : <p className="caption">每位學生都還有堂數。</p>}
          </section>
        </>
      )}
    </>
  );
}

/** Today on the coach home. "Done" = marked attended, or its start time has passed. */
function TodayList({ lessons }: { lessons: Lesson[] }) {
  const now = studioNowTime();
  const done = (l: Lesson) => l.status === 'Attended' || l.time <= now;
  const nextId = lessons.find((l) => !done(l) && !l.change)?.id ?? lessons.find((l) => !done(l))?.id;
  const upcoming = lessons.filter((l) => !done(l)), finished = lessons.filter(done);
  const row = (l: Lesson) => {
    const isDone = done(l), isNext = l.id === nextId;
    return (
      <li key={l.id} className={`th-lesson${isDone ? ' is-done' : ''}${isNext ? ' is-next' : ''}`} aria-current={isNext ? 'true' : undefined}>
        <span className="th-time">{l.time}</span>
        <div className="th-body">
          <p className="th-name">{l.studentName}</p>
          <p className="th-meta">{fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]}</p>
        </div>
        {isNext ? <span className="th-next">下一堂</span>
          : isDone ? <span className="th-state done">已上課</span>
          : l.change ? <span className="th-state warn">改時間中</span>
          : <span className="th-state">已預約</span>}
      </li>);
  };
  // upcoming first (next class on top), finished ones sink to a quiet group below
  return (
    <>
      {upcoming.length ? <ul className="th-list">{upcoming.map(row)}</ul> : <p className="th-allDone">今天的課都上完了。</p>}
      {finished.length > 0 && <>
        <p className="th-sub" id="th-done-h">已結束 · {finished.length} 堂</p>
        <ul className="th-list" aria-labelledby="th-done-h">{finished.map(row)}</ul>
      </>}
    </>
  );
}

/** Compact row for 堂數用完. A pending receipt is the one thing Iris can act on, so it becomes a link to 付款. */
function QuotaRow({ s }: { s: StudentSummary }) {
  return (
    <li className="th-qrow">
      <Link to={`/teacher/students/${s.id}`} className="th-qwho" viewTransition>
        <span className="avatar th-qavatar" aria-hidden="true">{initial(s.name)}</span>
        <span className="th-qtext"><span className="th-qname">{s.name}</span><span className="th-qmeta">{CLASS_TYPE_LABEL[s.classType]} · 剩 0 堂</span></span>
      </Link>
      {s.paymentPending
        ? <Link to="/teacher/payments" className="th-pending" viewTransition>收據待確認 <span aria-hidden="true">→</span></Link>
        : <span className="th-used">● 用完</span>}
    </li>
  );
}

/** 4 quiet botanical-neutral avatar tones, picked from the id so a student always gets the same one. */
const AVATAR_TONES = ['#DDE4DC', '#E5DFD2', '#D9E1DE', '#E4DDD8'];
function avatarTone(id: string) { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AVATAR_TONES[h % AVATAR_TONES.length]; }

function StudentRow({ s }: { s: StudentSummary }) {
  // only exceptions get a status word; healthy students stay quiet so the ones needing action stand out
  const flag = s.status === 'Pending' ? { cls: 'pending', word: '確認中' }
    : s.credits === 0 ? { cls: 'out', word: '用完' }
    : s.credits === 1 ? { cls: 'low', word: '快用完' } : null;
  const credit = s.credits === 0 ? 'out' : s.credits === 1 ? 'low' : 'ok';
  const next = s.status === 'Pending' ? '等待確認帳號' : s.paymentPending ? '收據待確認' : s.nextLesson ? `下次 ${fmtSlot(s.nextLesson.date, s.nextLesson.time)}` : '沒有預約';
  return (
    <li>
      <Link to={`/teacher/students/${s.id}`} className="sr" viewTransition>
        <span className="avatar sr-avatar" style={{ background: avatarTone(s.id) }} aria-hidden="true">{initial(s.name)}</span>
        <span className="sr-body">
          <span className="sr-name">{s.name}</span>
          <span className="sr-meta">{CLASS_TYPE_LABEL[s.classType]} · {s.status === 'Pending' ? '新學生' : <>剩 <b className={`sr-n ${credit}`}>{s.credits}</b> 堂</>}</span>
          <span className={`sr-next${s.paymentPending && s.status !== 'Pending' ? ' pay' : ''}`}>{next}</span>
        </span>
        <span className={`sr-flag${flag ? ` ${flag.cls}` : ''}`}>{flag ? `● ${flag.word}` : ''}</span>
        <span className="sr-chev"><Icon name="chev" size={16} /></span>
      </Link>
    </li>
  );
}

/* =================== Calendar =================== */
export function TeacherCalendar() {
  const [from, to] = monthRange();
  const lessons = useLessons('teacher', from, to);
  const today = studioToday();
  const [ym, setYm] = useState(() => [Number(today.slice(0, 4)), Number(today.slice(5, 7))]);
  const [sel, setSel] = useState(today);
  const byDay = useMemo(() => { const m = new Map<string, Lesson[]>(); (lessons.data ?? []).filter((l) => l.status !== 'Cancelled').forEach((l) => m.set(l.date, [...(m.get(l.date) ?? []), l])); return m; }, [lessons.data]);
  const shift = (d: number) => setYm(([y, m]) => { const t = m + d; return t < 1 ? [y - 1, 12] : t > 12 ? [y + 1, 1] : [y, t]; });
  const dayLessons = (byDay.get(sel) ?? []).sort(compareSlot);

  const nowT = studioNowTime();
  const isDone = (l: Lesson) => l.status === 'Attended' || l.date < today || (l.date === today && l.time <= nowT);

  return (
    <>
      {/* month lives only in the calendar's own nav — the header used to repeat it */}
      <PageHead title="行事曆" right={<Link to="/teacher/availability" className="tc-avail" viewTransition><Icon name="clock" size={18} />可預約時段</Link>} />
      {lessons.isPending ? <PageSkeleton blocks={[300]} /> : (
        <div className="split">
          <section className="card tc-cal" aria-label="月曆">
            <div className="tc-nav"><button className="icon-btn flat" aria-label="上個月" onClick={() => shift(-1)}><Icon name="back" /></button>
              <p className="tc-month" aria-live="polite">{ym[0]} 年 {ym[1]} 月</p><button className="icon-btn flat" aria-label="下個月" onClick={() => shift(1)}><Icon name="chev" /></button></div>
            <div className="cal tc-grid">
              {['一', '二', '三', '四', '五', '六', '日'].map((w) => <span className="wd" key={w}>{w}</span>)}
              {monthGrid(ym[0], ym[1]).map((d) => {
                const n = byDay.get(d)?.length ?? 0;
                return (
                  <button key={d} className={`${d.slice(5, 7) !== String(ym[1]).padStart(2, '0') ? 'out' : ''}${d === today ? ' today' : ''}`}
                    aria-pressed={sel === d} aria-label={`${monthNum(d)}月${dayNum(d)}日 星期${wd(d)}${n ? `，${n} 堂課` : ''}`} onClick={() => setSel(d)}>
                    <span>{dayNum(d)}</span><i className={n ? (d < today ? 'past' : 'up') : ''} />
                  </button>
                );
              })}
            </div>
          </section>
          <section className="card tc-day" aria-labelledby="tc-day-h">
            <h2 className="overline" id="tc-day-h">{sel === today ? '今天 · ' : ''}{fmtDate(sel)}{dayLessons.length ? ` · ${dayLessons.length} 堂` : ''}</h2>
            {dayLessons.length ? <ul className="tc-list">{dayLessons.map((l) => {
              const done = isDone(l);
              const canCancel = l.status === 'Booked' && !done;
              return (
                <li key={l.id} className={`tc-row${done ? ' is-done' : ''}`}>
                  <span className="tc-time">{l.time}</span>
                  <div className="tc-body">
                    <p className="tc-name">{l.studentName}</p>
                    <p className={`tc-state${done ? ' done' : l.change ? ' warn' : ''}`}>{done ? '● 已上課' : l.change ? (l.change.by === 'teacher' ? '◆ 等學生回覆' : '◆ 學生申請改時間') : '● 已預約'}</p>
                  </div>
                  {canCancel && !l.change && <Link to={`/teacher/students/${l.studentId}/propose/${l.id}`} className="tc-cancel tc-move" aria-label={`提議改時間：${l.studentName} ${fmtSlot(l.date, l.time)}`}>改時間</Link>}
                  {canCancel && <Link to={`lessons/${l.id}/cancel`} className="tc-cancel" aria-label={`取消 ${l.studentName} ${fmtSlot(l.date, l.time)} 的課`}>取消</Link>}
                </li>);
            })}</ul> : <Empty text="這天沒有課。" />}
          </section>
        </div>
      )}
      <Outlet />
    </>
  );
}

/** Teacher cancel = a route sheet, so the policy is shown at the moment it matters (not as permanent fine print). */
export function TeacherCancelSheet() {
  const { id } = useParams();
  const [from, to] = monthRange();
  const lessons = useLessons('teacher', from, to);
  const { cancel, undo } = useTeacherCancel();
  const toast = useToast();
  const nav = useNavigate();
  const l = lessons.data?.find((x) => x.id === id);
  if (!l) return null;
  return (
    <RouteSheet title="取消這堂課？" dismissible={!cancel.isPending}>
      <div className="inner tc-sheet-sum">
        <p className="tc-sheet-when">{fmtSlot(l.date, l.time)}</p>
        <p className="tc-sheet-who">{l.studentName} · {fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]}</p>
      </div>
      <ul className="tc-policy">
        <li><b>堂數會退回。</b>老師取消的課，{l.studentName}的 1 堂會自動加回帳號。</li>
        <li><b>10 秒後通知學生。</b>按下取消後有 10 秒可以復原，復原的話學生不會收到通知。</li>
      </ul>
      <button className="btn danger block" disabled={cancel.isPending}
        onClick={() => {
          const name = l.studentName, slot = fmtSlot(l.date, l.time);
          // mutateAsync: the promise still resolves after this sheet unmounts (mutate()'s own callbacks would not)
          cancel.mutateAsync(l.id)
            .then(() => toast({ text: `已取消 ${name} ${slot}，堂數已退回`, undo: async () => { await undo(l.id); } }))
            .catch((e) => toast({ text: (e as Error).message, kind: 'error' }));
          nav(-1);
        }}>取消這堂課</button>
      <button className="btn secondary block" onClick={() => nav(-1)}>保留這堂課</button>
    </RouteSheet>
  );
}

/* =================== Students =================== */
export function Students() {
  const students = useStudents();
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | 'out' | 'pay'>('all');
  const list = (students.data ?? []).filter((s) =>
    (f === 'all' || (f === 'out' && s.status === 'Active' && s.credits === 0) || (f === 'pay' && s.paymentPending)) &&
    (!q || s.name.includes(q) || (s.lineId ?? '').toLowerCase().includes(q.toLowerCase())));
  const count = (pred: (s: StudentSummary) => boolean) => (students.data ?? []).filter(pred).length;
  return (
    <>
      <PageHead title="學生" over={students.data ? `${students.data.length} 位學生` : ' '} />
      <label className="search sr-search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名或 LINE ID" aria-label="搜尋學生" /></label>
      <div className="fchips sr-chips" role="group" aria-label="篩選">
        <button className="fchip" aria-pressed={f === 'all'} onClick={() => setF('all')}>全部</button>
        <button className="fchip" aria-pressed={f === 'out'} onClick={() => setF('out')}>堂數用完 ({count((s) => s.status === 'Active' && s.credits === 0)})</button>
        <button className="fchip" aria-pressed={f === 'pay'} onClick={() => setF('pay')}>待付款 ({count((s) => s.paymentPending)})</button>
      </div>
      {students.isPending ? <ListSkeleton rows={6} /> : <section className="card sr-card">{list.length ? <ul className="sr-list">{list.map((s) => <StudentRow key={s.id} s={s} />)}</ul> : <p className="caption" style={{ padding: '16px 0' }}>找不到學生。</p>}</section>}
    </>
  );
}

const payDay = (iso: string) => studioToday(new Date(iso)).replaceAll('-', '/');
const PAY_WORD: Record<PaymentStatus, [string, string]> = { Confirmed: ['ok', '已確認'], Pending: ['wait', '待確認'], Rejected: ['bad', '已退回'] };

/** The coach's workspace for one student: who → course status → next classes → payment → history. */
export function StudentDetailPage() {
  const { id } = useParams();
  const s = useStudent(id!);
  if (s.isPending) return <PageSkeleton blocks={[120, 140, 160]} />;
  if (s.isError) return <ErrorCard error={s.error} retry={s.refetch} />;
  const d = s.data;
  const next = d.upcoming[0];
  const lastPay = d.payments[0];
  const credit = d.credits === 0 ? 'out' : d.credits === 1 ? 'low' : 'ok';
  return (
    <>
      <div className="sd-top"><Link to="/teacher/students" className="icon-btn flat" aria-label="返回學生列表" viewTransition><Icon name="back" /></Link><p className="overline">學生</p></div>
      <div className="sd">
        {/* 1. who */}
        <section className="sd-card sd-profile" aria-labelledby="sd-name">
          <div className="sd-who">
            <span className="avatar sd-avatar" style={{ background: avatarTone(d.id) }} aria-hidden="true">{initial(d.name)}</span>
            <div className="sd-id">
              <h1 className="sd-name" id="sd-name">{d.name}</h1>
              {(d.voiceType || d.grade) && <p className="sd-line">{[d.voiceType, d.grade].filter(Boolean).join(' · ')}</p>}
              {d.lineId && <p className="sd-line">LINE {d.lineId}</p>}
              <span className={`type-badge ${d.classType}`}>{CLASS_TYPE_LABEL[d.classType]}</span>
              {/* before posting a photo or video of this student, Iris checks this line */}
              <p className={`sd-consent ${d.consent.mediaWithdrawn ? 'warn' : d.consent.media ? 'ok' : ''}`}>
                {d.consent.media ? '● 同意肖像影音宣傳' : d.consent.mediaWithdrawn ? `◆ 已撤回肖像影音授權${d.consent.mediaAt ? `（${new Date(d.consent.mediaAt).toLocaleDateString('zh-TW')}）` : ''}，請移除已公開的內容` : '○ 未同意肖像影音宣傳，請勿公開照片或影片'}
                {d.consent.minor && <span className="sd-minor">未成年</span>}
              </p>
            </div>
          </div>
          <div className="sd-actions">
            {d.lineId
              ? <a className="sd-act primary" href={`https://line.me/ti/p/~${encodeURIComponent(d.lineId)}`} target="_blank" rel="noreferrer"><Icon name="msg" size={18} />LINE 聯絡</a>
              : <span className="sd-act" aria-disabled="true"><Icon name="msg" size={18} />沒有 LINE</span>}
            <Link to="adjust" className="sd-act">調整堂數</Link>
            <Link to="edit" className="sd-act">編輯</Link>
          </div>
        </section>

        {/* 2. course status */}
        <section className="sd-card" aria-labelledby="sd-quota-h">
          <h2 className="overline" id="sd-quota-h">課程狀態</h2>
          <dl className="sd-stats">
            <div><dt>剩餘</dt><dd><b className={`sd-big ${credit}`}>{d.credits}</b> 堂</dd></div>
            <div><dt>已預約</dt><dd><b className="sd-mid">{d.booked}</b> 堂</dd></div>
            <div className="wide"><dt>下一堂</dt><dd>{next ? fmtSlot(next.date, next.time) : '沒有預約'}</dd></div>
          </dl>
          {/* manual 繳費提醒 — a labelled button, not a bare icon: it sends a message to a real person.
              It turns into the main action of the card when 堂數 are (almost) used up. */}
          <div className="sd-remind">
            <Link to="remind" className={`sd-remind-btn${d.credits <= 1 ? ' urgent' : ''}`} aria-disabled={!d.remindChannel || undefined}
              onClick={(e) => { if (!d.remindChannel) e.preventDefault(); }}>
              <Icon name="bell" size={18} weight={d.credits <= 1 ? 'fill' : 'regular'} />通知學生繳學費
            </Link>
            <span className="sd-sub">{!d.remindChannel ? '沒有 LINE 或 Email，無法通知' : d.lastRemindedAt ? `上次提醒：${fmtRelative(d.lastRemindedAt)}` : `會透過 ${d.remindChannel === 'line' ? 'LINE' : 'Email'} 傳送`}</span>
          </div>
        </section>

        {/* 3. lessons — one container, three parts: 下一堂 (highlighted) · 後續課程 · 上過的課 */}
        <LessonsCard d={d} />

        {/* 4. payment */}
        <section className="sd-card" aria-labelledby="sd-pay-h">
          <div className="sd-head"><h2 className="overline" id="sd-pay-h">付款</h2>
            {d.payments.length > 0 && <Link to="payments" className="sd-link">查看付款紀錄 <span aria-hidden="true">→</span></Link>}</div>
          {lastPay ? (
            <div className="sd-pay">
              <div><p className="sd-amt">{lastPay.packageSize} 堂 · {fmtMoney(lastPay.amount)}</p><p className="sd-sub">{payDay(lastPay.uploadedAt)}</p></div>
              <span className={`sd-dot ${PAY_WORD[lastPay.status][0]}`}>● {PAY_WORD[lastPay.status][1]}</span>
            </div>) : <p className="sd-empty">沒有付款紀錄。</p>}
        </section>

      </div>
      <Outlet />
    </>
  );
}

/**
 * The lessons of one student in ONE container (no cards inside cards): hierarchy comes from type size,
 * a light sage wash on 下一堂, and hairline dividers — not from borders, shadows or icons.
 */
function LessonsCard({ d }: { d: StudentDetail }) {
  const [allPast, setAllPast] = useState(false);
  const [next, ...later] = d.upcoming;
  const PAST_SHOWN = 3;
  const past = allPast ? d.past : d.past.slice(0, PAST_SHOWN);
  return (
    <section className="sd-ls" aria-label="課程">
      <div className="sd-ls-part" aria-labelledby="sd-next-h">
        <h2 className="sd-ls-h" id="sd-next-h">下一堂</h2>
        {next ? <LessonItem l={next} next /> : (
          <div className="sd-ls-none"><p>目前沒有預約的課。</p><Link to="book" className="sd-ls-link sd-add">＋ 預約課程</Link></div>
        )}
      </div>
      <div className="sd-ls-part" aria-labelledby="sd-later-h">
        <div className="sd-ls-head"><h2 className="sd-ls-h" id="sd-later-h">後續課程{later.length ? ` · ${later.length}` : ''}</h2>
          {next && <Link to="book" className="sd-ls-link sd-add">＋ 預約課程</Link>}</div>
        {later.length ? <ul className="sd-ls-list">{later.map((l) => <LessonItem key={l.id} l={l} />)}</ul>
          : <p className="sd-ls-empty">目前沒有其他已預約的課程</p>}
      </div>
      <div className="sd-ls-part" aria-labelledby="sd-past-h">
        <div className="sd-ls-head"><h2 className="sd-ls-h" id="sd-past-h">上過的課{d.past.length ? ` · ${d.past.length}` : ''}</h2>
          {d.past.length > PAST_SHOWN && <button className="sd-ls-link" aria-expanded={allPast} onClick={() => setAllPast(!allPast)}>
            {allPast ? '收起' : <>查看全部 <span aria-hidden="true">→</span></>}</button>}</div>
        {d.past.length ? <ul className="sd-ls-past">{past.map((l) => (
          <li key={l.id}><span>{fmtSlot(l.date, l.time)}</span><span>{l.status === 'Attended' ? '已上課' : LESSON_TYPE_LABEL[l.type]}</span></li>))}</ul>
          : <p className="sd-ls-empty">還沒有上過課</p>}
      </div>
    </section>
  );
}

/** One upcoming lesson: plain, a student request (Iris decides), or Iris's proposal (the student decides). */
function LessonItem({ l, next }: { l: Lesson; next?: boolean }) {
  const { withdraw } = useProposals();
  const toast = useToast();
  const c = l.change;
  const state = !c ? <p className="sd-li-st ok">● 已確認 · {fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]}</p>
    : c.by === 'student' ? <p className="sd-li-st wait">● 等待改時間申請處理 · 學生想改到 {fmtSlot(c.toDate, c.toTime)}</p>
    : <p className="sd-li-st wait">◆ 等待學生回覆 · 你提議改到 {fmtSlot(c.toDate, c.toTime)}</p>;
  const action = !c ? <Link to={`propose/${l.id}`} className={next ? 'sd-li-btn' : 'sd-ls-link'}>提議改時間{next ? <span aria-hidden="true">→</span> : null}</Link>
    : c.by === 'student' ? <Link to="/teacher/requests" className={next ? 'sd-li-btn' : 'sd-ls-link'}>查看申請 <span aria-hidden="true">→</span></Link>
    : <button className={next ? 'sd-li-btn' : 'sd-ls-link'} disabled={withdraw.isPending}
      onClick={() => withdraw.mutateAsync(c.id).then(() => toast({ text: '已收回提議，課程維持原時間' })).catch((e) => toast({ text: (e as Error).message, kind: 'error' }))}>收回提議</button>;
  const Tag = next ? 'div' : 'li';
  return (
    <Tag className={`sd-lesson${next ? ' is-next' : ''}`}>
      <div className="sd-li-body">
        <p className={`sd-li-when${c ? ' was' : ''}`}>{fmtSlot(l.date, l.time)}</p>
        {state}
      </div>
      {action}
    </Tag>
  );
}

/** Iris books for a student: same slot rules as the student's own booking, uses one of the student's 堂數. */
export function TeacherBookSheet() {
  const { id } = useParams();
  const s = useStudent(id!);
  const book = useTeacherBook(id!);
  const toast = useToast();
  const nav = useNavigate();
  // start on the first open day (same query the picker uses, so no extra request)
  const days = useDays(addDays(studioToday(), -1));
  const [picked, setDate] = useState<string | null>(null);
  const date = picked ?? days.data?.find((x) => x.state === 'open')?.date ?? null;
  const [time, setTime] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(true);
  const [key, setKey] = useState(newIdempotencyKey);
  const d = s.data;
  if (!d) return null;
  const none = d.credits === 0;
  const save = () => {
    if (!date || !time) return;
    const name = d.name, slot = fmtSlot(date, time);
    book.mutateAsync({ date, time, key })
      .then(() => { toast({ text: `已幫${name}預約 ${slot}` }); nav(`/teacher/students/${id}`, { replace: true }); })
      .catch((e) => { toast({ text: (e as Error).message, kind: 'error' }); setTime(null); setKey(newIdempotencyKey()); });
  };
  return (
    <RouteSheet title={`幫${d.name}預約`} dismissible={!book.isPending}>
      {none ? (
        <div className="notice" role="alert"><Icon name="info" /><span>{d.name}沒有剩餘堂數。請先<Link to={`/teacher/students/${id}/adjust`} replace>調整堂數</Link>，或請學生購買新方案。</span></div>
      ) : <>
        <SlotPicker date={date} time={time} onDate={(x) => { setDate(x); setTime(null); }} onTime={setTime} onlyFree={onlyFree} setOnlyFree={setOnlyFree} />
        <p className="sd-sub">會用掉 1 堂（預約後剩 {d.credits - 1} 堂）。{d.name}會收到通知。</p>
        <button className="btn primary block" disabled={!date || !time || book.isPending} onClick={save}>
          {book.isPending ? '預約中…' : date && time ? `預約 ${fmtSlot(date, time)}` : '請選擇時段'}</button>
      </>}
      <button className="btn secondary block" onClick={() => nav(-1)}>返回</button>
    </RouteSheet>
  );
}

/**
 * 提議改時間: Iris never moves a lesson on her own (decided 8 Nov). She proposes a slot, the student accepts or not.
 * If the student had asked for another time, this proposal answers (and replaces) that request.
 */
export function ProposeSheet() {
  const { id, lessonId } = useParams();
  const s = useStudent(id!);
  const { propose } = useProposals();
  const toast = useToast();
  const nav = useNavigate();
  // start on the first open day (same query the picker uses, so no extra request)
  const days = useDays(addDays(studioToday(), -1));
  const [picked, setDate] = useState<string | null>(null);
  const date = picked ?? days.data?.find((x) => x.state === 'open')?.date ?? null;
  const [time, setTime] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(true);
  const [msg, setMsg] = useState('');
  const d = s.data;
  const l = d?.upcoming.find((x) => x.id === lessonId);
  if (!d) return null;
  if (!l) return <RouteSheet title="提議改時間"><p className="sd-empty">找不到這堂課，可能已經上過或取消了。</p><button className="btn secondary block" onClick={() => nav(-1)}>返回</button></RouteSheet>;
  const replaces = l.change?.by === 'student';
  const send = () => {
    if (!date || !time) return;
    const name = d.name;
    propose.mutateAsync({ lessonId: l.id, date, time, message: msg.trim() })
      .then(() => { toast({ text: `已傳送給${name}，等學生回覆` }); nav(`/teacher/students/${id}`, { replace: true }); })
      .catch((e) => toast({ text: (e as Error).message, kind: 'error' }));
  };
  return (
    <RouteSheet title={`提議改時間 · ${d.name}`} dismissible={!propose.isPending}>
      <div className="inner row"><div className="grow stack g1"><p className="caption">目前時段（保留到學生同意）</p><p className="t">{fmtSlot(l.date, l.time)}</p></div><Icon name="arrow" />
        <div className="grow stack g1"><p className="caption">提議時段</p><p className="t">{date && time ? fmtSlot(date, time) : '—'}</p></div></div>
      {replaces && <div className="notice"><Icon name="info" /><span>{d.name}申請改到 {fmtSlot(l.change!.toDate, l.change!.toTime)}。送出提議後，這個申請會自動婉拒。</span></div>}
      <SlotPicker date={date} time={time} onDate={(x) => { setDate(x); setTime(null); }} onTime={setTime} onlyFree={onlyFree} setOnlyFree={setOnlyFree} exclude={{ date: l.date, time: l.time }} />
      <div className="field"><label htmlFor="pm">給學生的訊息（選填）</label>
        <textarea id="pm" className="input" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={200} placeholder="例如：那天早上我有事，下午可以嗎？" /></div>
      <button className="btn primary block" disabled={!date || !time || propose.isPending} onClick={send}>{propose.isPending ? '傳送中…' : '傳送提議給學生'}</button>
      <button className="btn secondary block" onClick={() => nav(-1)}>返回</button>
    </RouteSheet>
  );
}

/** 通知學生繳學費: preview + edit the message, see where it goes, then send (queued 10 s → 復原). */
export function RemindSheet() {
  const { id } = useParams();
  const s = useStudent(id!);
  const studio = useStudio();
  const { mutation, undo } = useSendReminder(id!);
  const toast = useToast();
  const nav = useNavigate();
  const d = s.data;
  const pk = studio.data?.packages ?? [];
  const [msg, setMsg] = useState<string | null>(null);
  if (!d) return null;
  const draft = msg ?? [
    `嗨 ${d.name}，你目前剩 ${d.credits} 堂課。`,
    `想繼續上課的話，可以購買新的堂數${pk.length ? `（${pk.map((x) => `${x.size} 堂 ${fmtMoney(x.price)}`).join(' / ')}）` : ''}。`,
    '匯款後在 IRIS 上傳收據就可以了，謝謝！— Iris',
  ].join('\n');
  const recent = d.lastRemindedAt && Date.now() - Date.parse(d.lastRemindedAt) < 24 * 3600 * 1000;
  const via = d.remindChannel === 'line' ? 'LINE' : 'Email';
  const to = d.remindChannel === 'line' ? (d.lineId ?? d.name) : (d.email ?? '');
  const send = () => {
    const name = d.name;
    mutation.mutateAsync(draft.trim())
      .then((r) => toast({ text: `10 秒後透過 ${r.channel === 'line' ? 'LINE' : 'Email'} 傳給 ${name}`, undo: () => undo(r.id) }))
      .catch((e) => toast({ text: (e as Error).message, kind: 'error' }));
    nav(-1);
  };
  return (
    <RouteSheet title="通知學生繳學費">
      <p className="rm-to">
        {d.remindChannel === 'line' ? <span className="li-mark" aria-hidden="true"><Icon name="msg" size={14} /></span> : <span className="rm-mail" aria-hidden="true"><Icon name="msg" size={14} /></span>}
        <span>透過 <b>{via}</b> 傳給 {d.name}<small>{to}</small></span>
      </p>
      {recent && <p className="notice"><Icon name="info" /><span>{fmtRelative(d.lastRemindedAt!)}已經提醒過了，確定要再傳一次嗎？</span></p>}
      <div className="field"><label htmlFor="rm-msg">訊息內容</label>
        <textarea id="rm-msg" className="input rm-msg" rows={5} maxLength={500} value={draft} onChange={(e) => setMsg(e.target.value)} />
        <p className="av-hint">{draft.length} / 500 · 學生的 IRIS 通知也會收到這則訊息。</p></div>
      <button className="btn primary block" disabled={!draft.trim() || mutation.isPending} onClick={send}><Icon name="bell" size={18} />傳送提醒</button>
      <button className="btn secondary block" onClick={() => nav(-1)}>取消</button>
    </RouteSheet>
  );
}

const ADJ_REASONS = ['補課', '贈送', '修正錯誤', '其他'] as const;
/** 調整堂數: direction + amount + reason, previewed before saving — no casual +/− taps on the main page. */
export function AdjustCreditsSheet() {
  const { id } = useParams();
  const s = useStudent(id!);
  const adjust = useAdjustCredits(id!);
  const toast = useToast();
  const nav = useNavigate();
  const [dir, setDir] = useState<1 | -1>(1);
  const [n, setN] = useState(1);
  const [why, setWhy] = useState<(typeof ADJ_REASONS)[number] | null>(null);
  const [note, setNote] = useState('');
  const d = s.data;
  if (!d) return null;
  const delta = dir * n;
  const after = d.credits + delta;
  const invalid = after < 0;
  const reason = why === '其他' ? note.trim() : [why, note.trim()].filter(Boolean).join('：');
  const ready = !!why && !invalid && (why !== '其他' || note.trim().length > 0);
  const save = () => {
    const name = d.name;
    adjust.mutateAsync({ delta, reason })
      .then(() => toast({ text: `${name} ${delta > 0 ? '+' : '−'}${Math.abs(delta)} 堂（已記錄並通知）`, undo: () => adjust.mutateAsync({ delta: -delta, reason: '復原上一次調整' }).then(() => undefined) }))
      .catch((e) => toast({ text: (e as Error).message, kind: 'error' }));
    nav(-1);
  };
  return (
    <RouteSheet title="調整堂數" dismissible={!adjust.isPending}>
      <div className="adj-preview" aria-live="polite">
        <span className="sd-sub">{d.name}</span>
        <p><b>{d.credits}</b> 堂 <span aria-hidden="true">→</span><span className="sr-only">調整後</span> <b className={invalid ? 'neg' : ''}>{after}</b> 堂</p>
      </div>
      <fieldset className="adj-field"><legend>調整</legend>
        <div className="fchips" role="radiogroup" aria-label="增加或減少">
          <button role="radio" aria-checked={dir === 1} className="fchip" onClick={() => setDir(1)}>增加</button>
          <button role="radio" aria-checked={dir === -1} className="fchip" onClick={() => setDir(-1)}>減少</button>
        </div>
        <div className="fchips" role="radiogroup" aria-label="堂數">
          {[1, 2, 3, 4].map((k) => <button key={k} role="radio" aria-checked={n === k} aria-label={`${k} 堂`} className="fchip num" onClick={() => setN(k)}>{k}</button>)}
        </div>
        {invalid && <p className="adj-err">堂數不能小於 0。</p>}
      </fieldset>
      <fieldset className="adj-field"><legend>原因（必填）</legend>
        <div className="fchips" role="radiogroup" aria-label="原因">
          {ADJ_REASONS.map((r) => <button key={r} role="radio" aria-checked={why === r} className="fchip" onClick={() => setWhy(r)}>{r}</button>)}
        </div>
        <label className="sr-only" htmlFor="adj-note">備註</label>
        <input id="adj-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={why === '其他' ? '請寫下原因' : '備註（選填）'} />
      </fieldset>
      <p className="sd-sub">調整會留下紀錄，並通知學生。</p>
      <button className="btn primary block" disabled={!ready || adjust.isPending} onClick={save}>儲存調整</button>
    </RouteSheet>
  );
}

/** 編輯學生 — course type lives here now, not as an always-visible control. */
export function EditStudentSheet() {
  const { id } = useParams();
  const s = useStudent(id!);
  const setType = useSetClassType(id!);
  const toast = useToast();
  const nav = useNavigate();
  const [t, setT] = useState<StudentSummary['classType'] | null>(null);
  const d = s.data;
  if (!d) return null;
  const cur = t ?? d.classType;
  return (
    <RouteSheet title={`編輯 ${d.name}`}>
      <fieldset className="adj-field"><legend>課程類型</legend>
        <div className="fchips" role="radiogroup" aria-label="課程類型">
          {(['private', 'group', 'trial'] as const).map((k) => <button key={k} role="radio" aria-checked={cur === k} className="fchip" onClick={() => setT(k)}>{CLASS_TYPE_LABEL[k]}</button>)}
        </div>
      </fieldset>
      <button className="btn primary block" disabled={cur === d.classType || setType.isPending}
        onClick={() => { const name = d.name; setType.mutateAsync(cur).then(() => toast({ text: `${name} 改為${CLASS_TYPE_LABEL[cur]}` })).catch((e) => toast({ text: (e as Error).message, kind: 'error' })); nav(-1); }}>儲存</button>
      <button className="btn secondary block" onClick={() => nav(-1)}>取消</button>
    </RouteSheet>
  );
}

export function PaymentHistorySheet() {
  const { id } = useParams();
  const s = useStudent(id!);
  const d = s.data;
  if (!d) return null;
  return (
    <RouteSheet title="付款紀錄">
      <ul className="sd-hist pay">{d.payments.map((p) => (
        <li key={p.id}><span><b>{p.packageSize} 堂 · {fmtMoney(p.amount)}</b><br /><small>{payDay(p.uploadedAt)}</small></span>
          <span className={`sd-dot ${PAY_WORD[p.status][0]}`}>● {PAY_WORD[p.status][1]}</span></li>))}</ul>
    </RouteSheet>
  );
}
const PayTag = ({ s }: { s: PaymentStatus }) => <Tag tone={s === 'Confirmed' ? 'ok' : s === 'Rejected' ? 'bad' : 'warn'}>{{ Confirmed: '已確認', Rejected: '已退回', Pending: '待確認' }[s]}</Tag>;

/* =================== Requests =================== */
/* =================== 收件匣 (申請 · 付款 · 諮詢) =================== */
/**
 * 收件匣 is not a new page: it is the three existing pages under one tab, with the same routes as before
 * (old links and the ⌘K menu still work). These tabs switch between them and show what is waiting in each.
 */
function InboxTabs() {
  const ov = useOverview();
  const c = ov.data?.counts;
  const { pathname } = useLocation();
  const tabs = [
    { to: '/teacher/requests', label: '申請', n: c ? c.changes + c.applications : 0 },
    { to: '/teacher/payments', label: '付款', n: c?.receipts ?? 0 },
    { to: '/teacher/consults', label: '諮詢', n: c?.consults ?? 0 },
  ];
  return (
    <>
      <PageHead title="收件匣" />
      <nav className="ibx-tabs" aria-label="收件匣">
        {tabs.map((t) => {
          const here = pathname.startsWith(t.to);
          return <Link key={t.to} to={t.to} replace viewTransition aria-current={here ? 'page' : undefined} className={here ? 'on' : undefined}>
            {t.label}{t.n > 0 && <span className="ibx-n" aria-label={`${t.n} 件待處理`}>{t.n}</span>}</Link>;
        })}
      </nav>
    </>
  );
}

/** /teacher/inbox: open the tab that has work waiting (申請 → 付款 → 諮詢), else 申請 */
export function InboxIndex() {
  const ov = useOverview();
  const c = ov.data?.counts;
  if (ov.isPending) return <PageSkeleton />;
  const to = !c || c.changes + c.applications ? '/teacher/requests' : c.receipts ? '/teacher/payments' : c.consults ? '/teacher/consults' : '/teacher/requests';
  return <Navigate to={to} replace />;
}

/* =================== 更多 =================== */
const statusLabelOf = (t: TeacherPublic) => (t.status === 'custom' ? t.statusLabel ?? '自訂' : TEACHER_STATUS_LABEL[t.status]);

export function TeacherMore() {
  const me = useCurrentUser();
  const studio = useStudio();
  const logout = useLogout();
  const nav = useNavigate();
  const row = (to: string, icon: string, title: string, sub: string) => (
    <Link to={to} className="mo-row" viewTransition>
      <span className="mo-ic" aria-hidden="true"><Icon name={icon} size={20} /></span>
      <span className="mo-body"><span className="mo-t">{title}</span><span className="mo-s">{sub}</span></span>
      <Icon name="chev" size={18} />
    </Link>
  );
  return (
    <>
      <PageHead title="更多" />
      <Link to="/teacher/profile" className="mo-me mo-list" viewTransition>
        <span className="avatar">{studio.data?.teacher.avatarUrl ? <img src={studio.data.teacher.avatarUrl} alt="" /> : initialOf(me.name)}</span>
        <span className="mo-body"><span className="mo-t">{me.name}</span><span className="mo-s">教師個人資料 · 狀態：{studio.data ? statusLabelOf(studio.data.teacher) : '…'}</span></span>
        <Icon name="chev" size={18} />
      </Link>
      <section className="mo-list" aria-label="工作室">
        {row('/teacher/availability', 'clock', '可預約時段', '每週時段、特殊日期')}
        {row('/teacher/more/packages', 'receipt', '課程方案', '堂數與價格')}
        {row('/teacher/availability?tab=settings', 'gear', '設定', '每堂課時長、課程間隔、可提前預約')}
      </section>
      <section className="mo-list" aria-label="隱私">
        {row('/teacher/privacy-requests', 'info', '個資權利申請', '查詢、更正、刪除、撤回同意 · 法定期限內回覆')}
        {row('/legal/privacy', 'eye', '法律與隱私文件', '服務條款、隱私權政策等（草案）')}
      </section>
      <section className="mo-list" aria-label="帳號">
        <button className="mo-row mo-out" onClick={() => { nav('/'); logout.mutate(); }}>
          <span className="mo-ic" aria-hidden="true"><Icon name="logout" size={20} /></span><span className="mo-body"><span className="mo-t">登出</span></span>
        </button>
      </section>
      <Outlet />
    </>
  );
}

/* =================== 個資權利申請 (teacher) =================== */
const PRIV_LABEL: Record<PrivacyRequestType, string> = { access: '查詢或閱覽', copy: '製給複製本', correct: '補充或更正', stop: '停止蒐集處理利用', delete: '刪除', withdraw: '撤回同意' };

/** 個資法 §13: 15 days (查詢/閱覽/複本) or 30 days (更正/停止/刪除) to decide. The due date leads each card. */
export function PrivacyRequestsPage() {
  const q = usePrivacyRequests();
  const done = useMarkPrivacyDone();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const now = Date.now();
  return (
    <>
      <PageHead title="個資權利申請" back />
      <p className="caption" style={{ maxWidth: 720 }}>請先確認申請人身分（例如請對方從註冊的 Email 或 LINE 回覆），再處理。延長期限時，需以書面告知原因。</p>
      {q.isPending ? <ListSkeleton rows={2} /> : q.isError ? <ErrorCard error={q.error} retry={q.refetch} /> : q.data!.length === 0
        ? <InboxEmpty title="目前沒有個資權利申請" text="有人從網站「個人資料權利申請」送出後，會出現在這裡。" /> : (
        <div className="rq-list">{q.data!.map((p) => {
          const left = Math.ceil((Date.parse(p.dueAt) - now) / 864e5);
          return (
            <article key={p.id} className={`rq pr-card${p.status === 'done' ? ' is-done' : ''}`} aria-labelledby={`pr-${p.id}`}>
              <header className="rq-who"><div className="rq-who-text">
                <h2 className="rq-name" id={`pr-${p.id}`}>{p.name} · {PRIV_LABEL[p.type]}</h2>
                <p className="rq-sub">{p.contact} · {fmtRelative(p.createdAt)} 送出</p></div></header>
              {p.detail && <p className="rq-reason">「{p.detail}」</p>}
              <div className="rq-foot">
                {p.status === 'done'
                  ? <p className="rq-status ok">● 已處理 · {p.note}</p>
                  : <p className={`rq-status ${left < 0 ? 'bad' : left <= 3 ? 'wait' : ''}`}>{left < 0 ? `✕ 已逾期 ${-left} 天` : `◆ ${fmtDate(p.dueAt.slice(0, 10))} 前需回覆（剩 ${left} 天）`}</p>}
                {p.status === 'open' && open !== p.id && <div className="rq-actions"><button className="rq-btn rq-approve" onClick={() => { setOpen(p.id); setNote(''); }}>標為已處理</button></div>}
              </div>
              {open === p.id && (
                <form className="pr-done" onSubmit={(e) => { e.preventDefault(); done.mutateAsync({ id: p.id, note }).then(() => { setOpen(null); toast({ text: '已記錄處理結果' }); }).catch((er) => toast({ text: (er as Error).message, kind: 'error' })); }}>
                  <div className="field"><label htmlFor={`pn-${p.id}`}>處理結果（會保存作為紀錄）</label>
                    <textarea id={`pn-${p.id}`} className="input" required maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：已於 11/10 以 Email 提供資料複本" /></div>
                  <div className="rq-actions"><button type="button" className="rq-btn rq-decline" onClick={() => setOpen(null)}>取消</button>
                    <button className="rq-btn rq-approve" disabled={!note.trim() || done.isPending}>儲存</button></div>
                </form>
              )}
            </article>
          );
        })}</div>
      )}
    </>
  );
}

/* =================== 教師個人資料 =================== */
const STATUS_ORDER: TeacherStatus[] = ['normal', 'vacation', 'noNewStudents', 'custom'];
const MESSAGE_IDEAS: Record<TeacherStatus, string[]> = {
  normal: ['歡迎隨時預約', '訊息通常當天回覆'],
  vacation: ['放假中，明天回覆', '這週休息，下週一恢復上課'],
  noNewStudents: ['目前名額已滿，暫停接新學生', '舊生預約照常'],
  custom: ['準備比賽中，回覆會慢一點', '外出演出，晚上回覆'],
};

export function TeacherProfilePage() {
  const prof = useTeacherProfile();
  if (prof.isPending) return <><PageHead title="教師個人資料" back /><PageSkeleton /></>;
  if (prof.isError) return <><PageHead title="教師個人資料" back /><ErrorCard error={prof.error} retry={prof.refetch} /></>;
  return <ProfileForm p={prof.data} />;
}

function ProfileForm({ p }: { p: TeacherProfile }) {
  const save = useSaveTeacherProfile();
  const { upload, remove } = useTeacherAvatar();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  // "saved" values come from the server on every render; the form keeps its own copy. dirty = they differ.
  // (No remount after saving or uploading a photo, so nothing Iris typed is thrown away.)
  const init = { name: p.name, lineId: p.lineId ?? '', lineIdPublic: p.lineIdPublic, status: p.status, statusLabel: p.statusLabel ?? '', statusMessage: p.statusMessage ?? '' };
  const [f, setF] = useState(init);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setSaved(false); };
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const customBad = f.status === 'custom' && !f.statusLabel.trim();
  // the preview is built from the form, not from the server: Iris sees the result before she saves
  const preview: TeacherPublic = { name: f.name.trim() || p.name, avatarUrl: p.avatarUrl, status: f.status, statusLabel: f.statusLabel, statusMessage: f.statusMessage.trim() || null, lineId: f.lineIdPublic && f.lineId.trim() ? f.lineId.trim() : null };

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || customBad) return;
    save.mutateAsync({ name: f.name, lineId: f.lineId || null, lineIdPublic: f.lineIdPublic, status: f.status, statusLabel: f.statusLabel || null, statusMessage: f.statusMessage || null })
      .then((r) => { setF({ name: r.name, lineId: r.lineId ?? '', lineIdPublic: r.lineIdPublic, status: r.status, statusLabel: r.statusLabel ?? '', statusMessage: r.statusMessage ?? '' }); setSaved(true); toast({ text: '已儲存，學生現在看到的是新的資料' }); })
      .catch((er) => toast({ text: (er as Error).message, kind: 'error' }));
  };
  const onPhoto = (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast({ text: '照片不能超過 2 MB。', kind: 'error' }); return; }
    upload.mutateAsync(file).then(() => toast({ text: '已更新大頭貼' })).catch((er) => toast({ text: (er as Error).message, kind: 'error' }));
  };

  return (
    <>
      <PageHead title="教師個人資料" back />
      <section className="tp-sec" aria-labelledby="tp-prev-h">
        <h2 className="overline" id="tp-prev-h">學生看到的樣子</h2>
        <TeacherStatusCard t={preview} preview />
        <p className="tp-hint">{dirty ? '◆ 這是預覽，按「儲存」後學生才會看到。' : '● 這是學生現在看到的樣子。'}</p>
      </section>

      <form className="tp-form" onSubmit={onSave} noValidate>
        <section className="tp-card" aria-labelledby="tp-av-h">
          <h2 className="tp-h" id="tp-av-h">大頭貼</h2>
          <div className="tp-av-row">
            <span className="tp-av" aria-hidden="true">{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initialOf(p.name)}</span>
            <div className="tp-av-act">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="tp-file" tabIndex={-1} aria-label="選擇大頭貼照片" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
              <button type="button" className="btn secondary sm" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>{upload.isPending ? '上傳中…' : p.avatarUrl ? '更換照片' : '上傳照片'}</button>
              {p.avatarUrl && <button type="button" className="tp-text-btn" disabled={remove.isPending} onClick={() => remove.mutateAsync().then(() => toast({ text: '已移除大頭貼' }))}>移除</button>}
              <p className="tp-hint">JPG、PNG 或 WEBP，2 MB 以內。照片會馬上更新。</p>
            </div>
          </div>
        </section>

        <section className="tp-card" aria-labelledby="tp-basic-h">
          <h2 className="tp-h" id="tp-basic-h">基本資料</h2>
          <div className="field"><label htmlFor="tp-name">教師名稱</label>
            <input id="tp-name" className="input" required maxLength={40} autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field"><label htmlFor="tp-line">LINE ID（聯絡用）</label>
            <input id="tp-line" className="input" maxLength={30} autoComplete="off" autoCapitalize="none" value={f.lineId} onChange={(e) => set('lineId', e.target.value)} placeholder="例如：iris.voice" /></div>
          <div className="tp-switch">
            <div><p className="tp-t" id="tp-pub-l">讓學生看到我的 LINE ID</p>
              <p className="tp-hint" id="tp-pub-d">{f.lineId.trim() ? (f.lineIdPublic ? '學生的首頁會顯示這個 ID。' : '關閉時只有你自己看得到。') : '先填寫 LINE ID 才能公開。'}</p></div>
            <button type="button" className="switch" role="switch" aria-checked={f.lineIdPublic && !!f.lineId.trim()} disabled={!f.lineId.trim()}
              aria-labelledby="tp-pub-l" aria-describedby="tp-pub-d" onClick={() => set('lineIdPublic', !f.lineIdPublic)} />
          </div>
        </section>

        <section className="tp-card" aria-labelledby="tp-st-h">
          <h2 className="tp-h" id="tp-st-h">目前狀態</h2>
          <div className="tp-status" role="radiogroup" aria-labelledby="tp-st-h">
            {STATUS_ORDER.map((s) => (
              <button type="button" key={s} role="radio" aria-checked={f.status === s} className="tp-st" onClick={() => set('status', s)}>
                <span aria-hidden="true">{s === 'normal' ? '●' : '◆'}</span>{TEACHER_STATUS_LABEL[s]}</button>))}
          </div>
          {f.status === 'custom' && (
            <div className="field"><label htmlFor="tp-label">自訂狀態名稱</label>
              <input id="tp-label" className="input" maxLength={12} value={f.statusLabel} onChange={(e) => set('statusLabel', e.target.value)} placeholder="例如：比賽準備中"
                aria-invalid={customBad || undefined} aria-describedby="tp-label-h" />
              <p className="tp-hint" id="tp-label-h">{customBad ? '請填寫 1–12 個字。' : `${f.statusLabel.length} / 12`}</p></div>
          )}
          <div className="field"><label htmlFor="tp-msg">狀態訊息</label>
            <input id="tp-msg" className="input" maxLength={60} value={f.statusMessage} onChange={(e) => set('statusMessage', e.target.value)} placeholder="例如：放假中，明天回覆" aria-describedby="tp-msg-h" />
            <p className="tp-hint" id="tp-msg-h">{f.statusMessage.length} / 60 · 學生會在首頁看到</p></div>
          <div className="tp-ideas" aria-label="訊息範例">
            {MESSAGE_IDEAS[f.status].map((m) => <button type="button" key={m} className="tp-idea" onClick={() => set('statusMessage', m)}>{m}</button>)}
          </div>
        </section>

        <button className="btn primary block" disabled={!dirty || customBad || save.isPending}>
          {save.isPending ? '儲存中…' : saved && !dirty ? '✓ 已儲存' : '儲存'}</button>
      </form>

      <AccountBindings p={p} />
    </>
  );
}

/**
 * 登入方式: how Iris signs in. Kept apart from the public profile on purpose —
 * the contact LINE ID above is just text students see; LINE 登入 here is the account she signs in with.
 */
function AccountBindings({ p }: { p: TeacherProfile }) {
  const { changeEmail, unlinkLine } = useTeacherAccount();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const fail = (er: unknown) => toast({ text: (er as Error).message, kind: 'error' });
  return (
    <section className="tp-card tp-acc" aria-labelledby="tp-acc-h">
      <h2 className="tp-h" id="tp-acc-h">登入方式</h2>
      <p className="tp-hint">只用來登入，學生看不到。</p>
      <div className="tp-bind">
        <span className="mo-ic" aria-hidden="true"><Icon name="mail" size={18} /></span>
        <div className="tp-bind-b"><p className="tp-t">Email</p><p className="tp-s">{p.email ?? '尚未設定'}</p>
          {p.email && <p className={`tp-badge ${p.emailVerified ? 'ok' : 'warn'}`}>{p.emailVerified ? '● 已驗證' : '◆ 待驗證 · 請到信箱點驗證連結'}</p>}</div>
        {!edit && <button className="btn secondary sm" onClick={() => { setEdit(true); setEmail(p.email ?? ''); }}>變更</button>}
      </div>
      {edit && (
        <form className="tp-email" onSubmit={(e) => { e.preventDefault(); changeEmail.mutateAsync({ email, password: pw }).then(() => { setEdit(false); setPw(''); toast({ text: '已更新 Email，請到新信箱完成驗證' }); }).catch(fail); }}>
          <div className="field"><label htmlFor="tp-em">新的 Email</label><input id="tp-em" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="tp-pw">目前的密碼</label><input id="tp-pw" className="input" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
            <p className="tp-hint">為了保護帳號，變更登入 Email 需要輸入密碼。</p></div>
          <div className="tp-email-act">
            <button type="button" className="btn secondary" onClick={() => { setEdit(false); setPw(''); }}>取消</button>
            <button className="btn primary" disabled={changeEmail.isPending || !email || !pw}>{changeEmail.isPending ? '更新中…' : '更新 Email'}</button>
          </div>
        </form>
      )}
      <div className="tp-bind">
        <span className="mo-ic" aria-hidden="true"><span className="li-mark"><Icon name="msg" size={14} /></span></span>
        <div className="tp-bind-b"><p className="tp-t">LINE 登入</p>
          <p className={`tp-badge ${p.lineLinked ? 'ok' : 'off'}`}>{p.lineLinked ? '● 已綁定' : '○ 尚未綁定'}</p>
          {!p.lineLinked && <p className="tp-hint">綁定後可以用 LINE 一鍵登入。LINE Login 設定完成後開放。</p>}</div>
        {p.lineLinked
          ? <button className="btn secondary sm" disabled={unlinkLine.isPending} onClick={() => unlinkLine.mutateAsync().then(() => toast({ text: '已解除 LINE 綁定' })).catch(fail)}>解除</button>
          : <button className="btn secondary sm" disabled aria-describedby="tp-acc-h">綁定</button>}
      </div>
    </section>
  );
}

/** 課程方案: what students see on 堂數與付款. Read-only — prices live in the server config for now. */
export function PackagesSheet() {
  const studio = useStudio();
  const nav = useNavigate();
  return (
    <RouteSheet title="課程方案">
      <ul className="mo-pk">{studio.data?.packages.map((p) => (
        <li key={p.size + String(p.trial)}><span className="mo-t">{p.trial ? '體驗課 · ' : ''}{p.size} 堂</span>
          <span className="mo-s">{p.trial ? '只限體驗學生，一次' : `每堂 ${fmtMoney(Math.round(p.price / p.size))}`}</span><b>{fmtMoney(p.price)}</b></li>))}</ul>
      <p className="caption">學生隨時都可以購買，確認收據後堂數會加在剩餘的堂數上，沒有使用期限。要調整方案或價格，請聯絡網站管理員。</p>
      <button className="btn secondary block" onClick={() => nav(-1)}>關閉</button>
    </RouteSheet>
  );
}

/** Friendly empty state for the inbox: what this means + when something will show up here. */
function InboxEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="ibx-empty">
      <span className="ibx-empty-ic" aria-hidden="true"><Icon name="check" size={18} weight="bold" /></span>
      <div><p className="ibx-empty-t">{title}</p><p className="ibx-empty-s">{text}</p></div>
    </div>
  );
}

export function RequestsPage() {
  const req = useRequests();
  const ch = useDecideChange();
  const app = useDecideApplication();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const changes = req.data?.changes ?? [], apps = req.data?.applications ?? [], props = req.data?.proposals ?? [];
  const waiting = props.filter((p) => p.status === 'open'), answered = props.filter((p) => p.status !== 'open');
  // sub-tab lives in the URL (?tab=), so the home card 新學生 → ?tab=apps and the back button keep working
  type Sub = 'changes' | 'apps' | 'waiting';
  const tab: Sub = sp.get('tab') === 'apps' ? 'apps' : sp.get('tab') === 'waiting' ? 'waiting' : 'changes';
  const setTab = (t: Sub) => setSp(t === 'changes' ? {} : { tab: t }, { replace: true });
  const { withdraw } = useProposals();
  const fail = (e: unknown) => toast({ text: (e as Error).message, kind: 'error' });

  const changeCards = changes.length > 0 && (
    <div className="rq-group" key="changes">
      <div className="rq-list">{changes.map((c) => (
        <article className={`rq${c.slotFree ? '' : ' is-conflict'}`} key={c.id} aria-labelledby={`rq-${c.id}`}>
          <header className="rq-who">
            <span className="avatar rq-avatar" aria-hidden="true">{initial(c.studentName)}</span>
            <h4 className="rq-name" id={`rq-${c.id}`}>{c.studentName}</h4>
          </header>
          <p className="rq-time">
            <span className="rq-old"><span className="sr-only">原時段 </span>{fmtSlot(c.fromDate, c.fromTime)}</span>
            <span className="rq-arrow" aria-hidden="true">→</span>
            <span className="rq-new"><span className="sr-only">改到 </span>{fmtSlot(c.toDate, c.toTime)}</span>
          </p>
          {c.reason && <p className="rq-reason">「{c.reason}」</p>}
          <div className="rq-foot">
            {c.slotFree ? <p className="rq-status ok">● 新時段可用</p> : (
              <div className="rq-conflict" id={`rq-why-${c.id}`}>
                <p className="rq-status bad">● 新時段已被預約</p>
                <p className="rq-why">此時段已有其他預約，請婉拒並請學生重新選擇。</p>
              </div>
            )}
            <div className="rq-actions">
              <Link to={`${c.id}/decline`} className="rq-btn rq-decline">婉拒</Link>
              <button className="rq-btn rq-approve" disabled={!c.slotFree || ch.mutation.isPending} aria-describedby={c.slotFree ? undefined : `rq-why-${c.id}`}
                onClick={() => ch.mutation.mutate({ id: c.id, approve: true }, { onSuccess: () => toast({ text: `已同意，10 秒後通知${c.studentName}`, undo: () => ch.undo(c.id) }), onError: fail })}>同意</button>
            </div>
          </div>
        </article>))}</div>
    </div>
  );
  const appCards = apps.length > 0 && (
    <div className="rq-group" key="apps" id="rq-apps">
      <div className="rq-list">{apps.map((a) => (
        <article className="rq" key={a.id} aria-labelledby={`ap-${a.id}`}>
          <header className="rq-who">
            <span className="avatar rq-avatar" aria-hidden="true">{initial(a.name)}</span>
            <div className="rq-who-text">
              <h4 className="rq-name" id={`ap-${a.id}`}>{a.name}</h4>
              <p className="rq-sub">{fmtRelative(a.createdAt)} 申請 · {a.email ? a.email : '使用 LINE 註冊'}</p>
            </div>
          </header>
          <div className="rq-foot">
            <p className="rq-status wait">● 等待你確認帳號</p>
            <div className="rq-actions">
              <button className="rq-btn rq-decline" disabled={app.mutation.isPending} onClick={() => app.mutation.mutate({ id: a.id, approve: false }, { onSuccess: () => toast({ text: `已婉拒${a.name}`, undo: () => app.undo(a.id) }), onError: fail })}>婉拒</button>
              <button className="rq-btn rq-approve" disabled={app.mutation.isPending} onClick={() => app.mutation.mutate({ id: a.id, approve: true }, { onSuccess: () => toast({ text: `已確認${a.name}的帳號`, undo: () => app.undo(a.id) }), onError: fail })}>確認</button>
            </div>
          </div>
        </article>))}</div>
    </div>
  );
  const propRow = (p: (typeof props)[number]) => (
    <li key={p.id} className="rq-prow">
      <div className="rq-pbody">
        <p className="rq-pname">{p.studentName}</p>
        <p className="rq-ptime">{fmtSlot(p.fromDate, p.fromTime)} <span aria-hidden="true">→</span><span className="sr-only">改到</span> <b>{fmtSlot(p.toDate, p.toTime)}</b></p>
        <p className={`rq-status ${p.status === 'open' ? 'wait' : p.status === 'approved' ? 'ok' : 'bad'}`}>
          {p.status === 'open' ? `◆ 已傳送 ${fmtRelative(p.createdAt)}` : p.status === 'approved' ? '● 學生已接受，已改時間' : '✕ 學生不方便，維持原時間'}</p>
      </div>
      {p.status === 'open'
        ? <button className="rq-btn rq-decline" disabled={withdraw.isPending} onClick={() => withdraw.mutateAsync(p.id).then(() => toast({ text: '已收回提議' })).catch(fail)}>收回</button>
        : p.status === 'declined' && <Link to={`/teacher/students/${p.studentId}/propose/${p.lessonId}`} className="rq-btn rq-decline">再提議</Link>}
    </li>
  );

  return (
    <>
      <InboxTabs />
      {req.isPending ? <ListSkeleton rows={2} /> : req.isError ? <ErrorCard error={req.error} retry={req.refetch} /> : (<>
        {/* sub-tabs: the first two wait for Iris (amber count), the third waits for the student (quiet grey count) */}
        <div className="seg rq-seg rq-sub3" role="tablist" aria-label="申請類型">
          <button role="tab" aria-selected={tab === 'changes'} onClick={() => setTab('changes')}>改時間{changes.length > 0 && <span className="ibx-n">{changes.length}</span>}</button>
          <button role="tab" aria-selected={tab === 'apps'} onClick={() => setTab('apps')}>新學生{apps.length > 0 && <span className="ibx-n">{apps.length}</span>}</button>
          <button role="tab" aria-selected={tab === 'waiting'} onClick={() => setTab('waiting')}>等學生回覆{waiting.length > 0 && <span className="rq-shn">{waiting.length}</span>}</button>
        </div>
        <section className="rq-sec" role="tabpanel" aria-label={{ changes: '改時間', apps: '新學生', waiting: '等待學生回覆' }[tab]}>
          {tab === 'changes' && (changes.length ? changeCards
            : <InboxEmpty title="沒有待處理的改時間申請" text="學生申請改時間時，會出現在這裡。" />)}
          {tab === 'apps' && (apps.length ? appCards
            : <InboxEmpty title="沒有新的學生申請" text="有人註冊帳號後，會在這裡等你確認。" />)}
          {tab === 'waiting' && <div className="rq-props">
            {waiting.length ? <ul className="rq-plist">{waiting.map(propRow)}</ul>
              : <InboxEmpty title="目前沒有等待學生回覆的提議" text="你提議新時間後，會在這裡等學生回覆。" />}
            {answered.length > 0 && (
              <details className="rq-recent">
                <summary>最近 7 天的回覆 · {answered.length}</summary>
                <ul className="rq-plist">{answered.map(propRow)}</ul>
              </details>
            )}
          </div>}
        </section>
      </>)}
      <Outlet />
    </>
  );
}

export function DeclineSheet() {
  const { id } = useParams();
  const req = useRequests();
  const ch = useDecideChange();
  const toast = useToast();
  const nav = useNavigate();
  const [msg, setMsg] = useState('');
  const c = req.data?.changes.find((x) => x.id === id);
  if (!c) return null;
  return (
    <RouteSheet title={`婉拒${c.studentName}的申請`} dismissible={!ch.mutation.isPending}>
      <div className="inner row"><div className="grow stack g1"><p className="caption">原時段（保留）</p><p className="t">{fmtSlot(c.fromDate, c.fromTime)}</p></div><Icon name="arrow" />
        <div className="grow stack g1"><p className="caption">申請時段</p><p className="t">{fmtSlot(c.toDate, c.toTime)}</p></div></div>
      <div className="field"><label htmlFor="dm">給學生的訊息（選填）</label><textarea id="dm" className="input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="例如：那天的 16:30 可以嗎？" /></div>
      <button className="btn danger block" disabled={ch.mutation.isPending}
        onClick={() => { const n = c.studentName; ch.mutation.mutate({ id: c.id, approve: false, message: msg }); nav('/teacher/requests', { replace: true }); toast({ text: `已婉拒，10 秒後通知${n}`, undo: () => ch.undo(c.id) }); }}>婉拒並通知學生</button>
      {/* Iris may say no and offer her own time instead — the lesson moves only if the student accepts */}
      <Link to={`/teacher/students/${c.studentId}/propose/${c.lessonId}`} replace className="btn secondary block"><Icon name="repeat" size={18} />婉拒並提議其他時間</Link>
      <button className="btn secondary block" onClick={() => nav(-1)}>返回</button>
    </RouteSheet>
  );
}

/* =================== Payments =================== */
export function PaymentsPage() {
  const [st, setSt] = useState<PaymentStatus>('Pending');
  const pays = usePayments(st);
  const total = (pays.data ?? []).reduce((s, p) => s + p.amount, 0);
  return (
    <>
      <InboxTabs />
      <div className="seg rq-seg" role="tablist" aria-label="收據狀態">
        {(['Pending', 'Confirmed', 'Rejected'] as const).map((s) => <button key={s} role="tab" aria-selected={st === s} onClick={() => setSt(s)}>{{ Pending: '待確認', Confirmed: '已確認', Rejected: '已退回' }[s]}</button>)}
      </div>
      {st === 'Pending' && pays.data && <p className="caption rq-summary">待確認 {pays.data.length} 筆 · 共 {fmtMoney(total)}。確認後堂數會自動加到學生帳號。</p>}
      {pays.isPending ? <ListSkeleton rows={2} /> : pays.isError ? <ErrorCard error={pays.error} retry={pays.refetch} /> : (
        pays.data!.length === 0 ? <InboxEmpty {...{
          Pending: { title: '沒有等待確認的收據', text: '學生上傳匯款證明後，會出現在這裡。' },
          Confirmed: { title: '還沒有已確認的收據', text: '確認過的收據會留在這裡，方便之後查帳。' },
          Rejected: { title: '沒有退回的收據', text: '退回的收據和原因會出現在這裡。' },
        }[st]} /> : <div className="rq-list">{pays.data!.map((p) => <PaymentRow key={p.id} p={p} />)}</div>
      )}
      <Outlet />
    </>
  );
}

function PaymentRow({ p }: { p: Payment }) {
  const { mutation, undo } = useDecidePayment();
  const toast = useToast();
  const [key] = useState(newIdempotencyKey); // one key per receipt row: a double click confirms once (#19)
  const [show, setShow] = useState(false);
  const pending = p.status === 'Pending';
  // mutateAsync, not mutate(…, {onSuccess}): the row disappears from 待確認 straight away (optimistic), and
  // mutate()'s per-call callbacks are dropped once the component unmounts — the promise still resolves.
  const [sent, setSent] = useState(false); // second guard next to the idempotency key: the button can't fire twice
  const confirm = () => { if (sent) return; setSent(true); return mutation.mutateAsync({ id: p.id, confirm: true, key })
    .then(() => toast({ text: `已確認，${p.studentName} +${p.packageSize} 堂`, undo: () => undo(p.id) }))
    .catch((e) => { setSent(false); toast({ text: (e as Error).message, kind: 'error' }); }); };
  return (
    <article className="rq" aria-labelledby={`pay-${p.id}`}>
      <header className="rq-who">
        <button className="rq-thumb" aria-label={`查看 ${p.studentName} 的收據`} aria-haspopup="dialog" onClick={() => setShow(true)}>
          <Icon name="image" size={20} /></button>
        <div className="rq-who-text grow">
          <h2 className="rq-name" id={`pay-${p.id}`}>{p.studentName}</h2>
          <p className="rq-sub">{fmtRelative(p.uploadedAt)} 上傳</p>
        </div>
        {!pending && <PayTag s={p.status} />}
      </header>
      <p className="rq-amount">{p.packageSize} 堂<span className="rq-dot" aria-hidden="true">·</span>{fmtMoney(p.amount)}</p>
      {p.note && <p className="rq-reason">「{p.note}」</p>}
      {p.rejectReason && <p className="rq-reject">退回原因：{p.rejectReason}</p>}
      {pending ? (
        <div className="rq-foot">
          <p className="rq-status wait">◆ 請先核對收據</p>
          <div className="rq-actions">
            <Link to={`${p.id}/reject`} className="rq-btn rq-decline">退回</Link>
            {/* credits are only added from inside the receipt viewer, after Iris has looked at the transfer */}
            <button className="rq-btn rq-approve" aria-haspopup="dialog" onClick={() => setShow(true)}>查看收據並確認</button>
          </div>
        </div>
      ) : <button className="rq-link" aria-haspopup="dialog" onClick={() => setShow(true)}>查看收據</button>}
      {show && <ReceiptModal p={p} onClose={() => setShow(false)} onConfirm={pending ? () => { setShow(false); confirm(); } : undefined} busy={sent || mutation.isPending} />}
    </article>
  );
}

/**
 * Receipt viewer: a centred modal over a dimmed page, so the screenshot gets the whole screen's attention.
 * Native <dialog>.showModal() gives us the hard parts for free: focus moves in and is trapped, Esc closes,
 * the page behind is inert for screen readers. Tap the dark area to close; decide right from here.
 */
function ReceiptModal({ p, onClose, onConfirm, busy }: { p: Payment; onClose: () => void; onConfirm?: () => void; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Iris ticks that she checked amount + transfer details before credits are added (no accidental confirm)
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    d.showModal();
    const y = window.scrollY; document.documentElement.classList.add('modal-open'); // stop the page scrolling behind
    return () => { document.documentElement.classList.remove('modal-open'); window.scrollTo(0, y); };
  }, []);
  return (
    <dialog ref={ref} className="rcpt" aria-labelledby={`rcpt-t-${p.id}`} onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}>
      <div className="rcpt-box">
        <header className="rcpt-head">
          <div>
            <h2 id={`rcpt-t-${p.id}`}>{p.studentName} 的收據</h2>
            <p>{p.packageSize} 堂 · {fmtMoney(p.amount)} · {fmtRelative(p.uploadedAt)} 上傳</p>
          </div>
          <button className="rcpt-x" aria-label="關閉" onClick={() => ref.current?.close()}><Icon name="x" size={20} /></button>
        </header>
        <div className="rcpt-img">
          {p.receiptUrl
            ? <BlurImage src={p.receiptUrl} lqip={p.lqip} alt={`${p.studentName} 上傳的轉帳截圖`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <div className="rcpt-none"><Icon name="image" size={40} /><span>（示範資料沒有圖片）</span></div>}
        </div>
        {p.note && <p className="rcpt-note">「{p.note}」</p>}
        {onConfirm && <>
          <label className="rcpt-check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>我已核對：金額 <b>{fmtMoney(p.amount)}</b>{p.note ? `，備註「${p.note}」` : ''}，和收到的匯款一致</span>
          </label>
          <div className="rcpt-actions">
            <Link to={`${p.id}/reject`} className="rq-btn rq-decline" onClick={() => ref.current?.close()}>退回</Link>
            <button className="rq-btn rq-approve" disabled={!checked || busy} aria-describedby={checked ? undefined : `rcpt-hint-${p.id}`} onClick={onConfirm}>
              {busy ? '確認中…' : `確認，加 ${p.packageSize} 堂`}</button>
          </div>
          {!checked && <p className="rcpt-hint" id={`rcpt-hint-${p.id}`}>請先勾選核對，再加堂數給{p.studentName}。</p>}
        </>}
      </div>
    </dialog>
  );
}

export function RejectSheet() {
  const { id } = useParams();
  const pays = usePayments('Pending');
  const { mutation, undo } = useDecidePayment();
  const toast = useToast();
  const nav = useNavigate();
  const [reason, setReason] = useState('');
  const [key] = useState(newIdempotencyKey);
  const p = pays.data?.find((x) => x.id === id);
  if (!p) return null;
  return (
    <RouteSheet title={`退回${p.studentName}的收據`} dismissible={!mutation.isPending}>
      <div className="inner stack g1"><p className="t">{p.packageSize} 堂 · {fmtMoney(p.amount)}</p><p className="caption">{fmtRelative(p.uploadedAt)} 上傳</p></div>
      <div className="field"><label htmlFor="rr">退回原因（學生會看到）</label><textarea id="rr" className="input" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：金額不符，請確認轉帳金額。" /></div>
      <button className="btn danger block" disabled={!reason.trim()}
        onClick={() => { mutation.mutate({ id: p.id, confirm: false, reason, key }); nav('/teacher/payments', { replace: true }); toast({ text: '已退回，10 秒後通知學生', undo: () => undo(p.id) }); }}>退回並通知學生</button>
      <button className="btn secondary block" onClick={() => nav(-1)}>返回</button>
    </RouteSheet>
  );
}

/* =================== Consults =================== */
export function ConsultsPage() {
  const cs = useConsults();
  const mark = useMarkContacted();
  const toast = useToast();
  return (
    <>
      <InboxTabs />
      <p className="caption">來自網站的免費諮詢表單</p>
      {cs.isPending ? <ListSkeleton rows={2} /> : (
        <section className="card tight">
          {cs.data!.length === 0 ? <InboxEmpty title="目前沒有新的諮詢" text="網站上的「免費諮詢」表單送出後，會出現在這裡。" /> : (
            <div className="list">{[...cs.data!].sort((a, b) => Number(a.contacted) - Number(b.contacted)).map((c) => (
              <div className="li col" key={c.id}>
                <div className="row"><span className="avatar">{initial(c.name)}</span>
                  <div className="grow stack g1"><p className="t">{c.name}</p><p className="caption">{c.contactType === 'line' ? 'LINE' : 'Email'} {c.contact} · 方便：{CONSULT_TIME_LABEL[c.preferredTime]}</p></div>
                  <Tag tone={c.contacted ? 'grey' : 'warn'}>{c.contacted ? '已聯絡' : '待聯絡'}</Tag></div>
                {c.topic && <p className="caption">「{c.topic}」</p>}
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn sm secondary" onClick={() => mark.mutate({ id: c.id, contacted: !c.contacted }, { onSuccess: () => toast({ text: c.contacted ? '已標為待聯絡' : '已標為已聯絡', undo: () => mark.mutateAsync({ id: c.id, contacted: c.contacted }).then(() => {}) }) })}>
                    {c.contacted ? '標為待聯絡' : '標為已聯絡'}</button>
                </div>
              </div>))}</div>
          )}
        </section>
      )}
    </>
  );
}
