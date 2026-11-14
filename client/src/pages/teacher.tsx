import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { useCurrentUser } from '../components/Shell';
import { showDone } from '../components/DoneDialog';
import { RecentPayments, TodayTimeline } from '../components/HomeBlocks';
import { NoteDialog, StudentsTable } from '../components/StudentTable';
import { SaveButton, useSaveFlow } from '../components/SaveButton';
import { RescheduleCard, SlotCompare, type RescheduleStatus } from '../components/RescheduleCard';
import { LessonNoteDialog } from '../components/LessonNoteDialog';
import { RouteSheet } from '../components/Sheet';
import { SlotPicker } from '../components/SlotPicker';
import { TEACHER_STATUS_LABEL, TeacherStatusCard } from '../components/TeacherStatus';
import { useToast } from '../components/Toast';
import { BlurImage, Empty, ErrorCard, ListSkeleton, PageHead, PageSkeleton, Sk, Tag } from '../components/ui';
import { api, newIdempotencyKey } from '../lib/api';
import { addDays, fmtStampMin, CLASS_TYPE_LABEL, CONSULT_TIME_LABEL, compareSlot, dayNum, monthNum, wd, initialOf, fmtDate, fmtMoney, fmtRelative, fmtSlot, monthGrid, studioToday, studioNowTime, fmtDuration, LESSON_TYPE_LABEL } from '../lib/date';
import { monthRange } from '../lib/prefetch';
import { closeModal, openModal } from '../lib/modalMotion';
import { recentDecisions, useRecentDecisions, type Decision } from '../lib/recentDecisions';
import {
  useAdjustCredits, useConsults, useDays, useLogout, useSetClassType, useDecideApplication, useDecideReport, useDecideChange, useDecidePayment, useLessons, useMarkContacted,
  useOverview, usePayments, useProposals, useRequests, useSendReminder, useStudent, useStudents, useStudio, useSavePackages, useMarkPrivacyDone, usePrivacyRequests, useTeacherAvatar, useTeacherAccount, useTeacherCancel, useTeacherProfile, useSaveTeacherProfile, useSaveStudentBasics, useSaveSkills, useSaveGrowth, useUploadStudentMedia,
} from '../lib/queries';
import type { ChangeRequest, Lesson, Payment, PaymentStatus, PrivacyRequestType, StudentDetail, StudentSummary, TeacherProfile, TeacherPublic, TeacherStatus } from '../lib/types';

/** "Friday, 2026 - 11 - 13" — weekday in English, numbers with spaced dashes (date string is Taipei YYYY-MM-DD) */
const fmtLongDate = (d: string) => { const [y, m, dd] = d.split('-'); const wd = new Date(`${d}T12:00:00+08:00`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Taipei' }); return `${wd}, ${y} - ${m} - ${dd}`; };
const greeting = () => { const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: 'numeric', hour12: false }).format(new Date())); return h < 11 ? '早安' : h < 18 ? '午安' : '晚安'; };
const initial = initialOf;

/**
 * One 今日待辦 card. Something waiting = amber edge + ◆ + number (shape and word, not colour alone);
 * zero = quiet: grey number, no mark — so Iris's eye goes only to the cards that need her.
 */
/** 今日待辦 card (A2 Soft Surface): title · icon circle (the only link) · big number + 待處理 · one detail line */
function Kpi({ to, title, icon, n, detail }: { to: string; title: string; icon: string; n: number; detail: string }) {
  return (
    <div className={`kpi2${n > 0 ? ' is-due' : ' is-clear'}`}>
      <div className="kpi2-top">
        <span className="kpi2-t">{title}</span>
        {/* → is the only link: "go to the related page" */}
        <Link to={to} className="kpi2-go" viewTransition aria-label={`前往${title}：${n > 0 ? `${n} 件待處理` : '沒有待處理'}，${detail}`}><Icon name="arrowLong" size={20} /></Link>
      </div>
      {/* the card's own symbol: big, no disc, 70 % — decoration only */}
      <span className="kpi2-deco" aria-hidden="true"><Icon name={icon} size={60} /></span>
      <p className="kpi2-n"><span className="kpi2-big">{n}</span>{n > 0 && <span className="kpi2-due">待處理</span>}</p>
      <p className="kpi2-d">{detail}</p>
    </div>
  );
}

/* =================== Home =================== */
export function TeacherHome() {
  const me = useCurrentUser();
  const ov = useOverview();
  const pays = usePayments('All');
  const studs = useStudents();
  const today = studioToday();
  const c = ov.data?.counts;
  return (
    <>
      {/* date first, centred, in a calm English format: "Friday, 2026 - 11 - 13" */}
      <p className="th-date"><time dateTime={today}>{fmtLongDate(today)}</time></p>
      <div className="th-hello">
        <h1 className="th-hi">{greeting()}，{me.name} !</h1>
        <p className="th-hi-cap">音樂帶來滿足和快樂，你學生值得幸福</p>
      </div>
      {ov.isPending ? <><div className="kpis">{[0, 1, 2, 3].map((i) => <Sk key={i} h={104} card />)}</div><ListSkeleton rows={3} /></>
        : ov.isError ? <ErrorCard error={ov.error} retry={ov.refetch} /> : (
        <>
          {/* order = what needs Iris first (今日待辦), then today's teaching, then students to follow up */}
          <section className="th-todo2" aria-labelledby="th-todo-h">
            <div className="th-todo2-head">
              <div><h2 className="th-todo2-t" id="th-todo-h">今日待辦</h2><p className="th-todo2-s">需要你關注的事項</p></div>
              {(() => { const total = c!.changes + c!.reports + c!.receipts + c!.applications + c!.consults;
                return <p className="th-todo2-count">{total ? `${total} 項待處理` : '都處理好了'}</p>; })()}
            </div>
            <div className="kpis2">
              <Kpi to={c!.changes || !c!.reports ? '/teacher/requests' : '/teacher/requests?tab=reports'} icon="reschedule" title="學生申請" n={c!.changes + c!.reports}
                detail={c!.changes + c!.reports ? [c!.changes && `改時間 ${c!.changes}`, c!.reports && `回報 ${c!.reports}`].filter(Boolean).join(' · ') : '沒有新的申請'} />
              <Kpi to="/teacher/payments" icon="receipt" title="待確認收據" n={c!.receipts} detail={c!.receipts ? `共 ${fmtMoney(c!.receiptsAmount)}` : '都已確認'} />
              <Kpi to="/teacher/requests?tab=apps" icon="user" title="新學生" n={c!.applications} detail={c!.applications ? '等待你確認帳號' : '沒有新的申請'} />
              <Kpi to="/teacher/consults" icon="msg" title="諮詢" n={c!.consults} detail={c!.consults ? '還沒聯絡' : '都已聯絡'} />
            </div>
          </section>
          <section className="th-sec th-today" aria-labelledby="th-today-h">
            <div className="card th-card">
              <div className="th-sec-head"><h2 className="th-h4" id="th-today-h">今天的課</h2>
                <Link to="/teacher/calendar" className="th-more" viewTransition>查看完整行事曆 <span aria-hidden="true">→</span></Link></div>
              <hr className="th-card-rule" />
              {ov.data!.today.length ? <TodayTimeline lessons={ov.data!.today} /> : <p className="caption">今天沒有課。</p>}</div>
          </section>
          <section className="th-sec th-pay" aria-labelledby="th-pay-h">
            <div className="card th-card">
              <div className="th-sec-head"><h2 className="th-h4" id="th-pay-h">最近付款記錄</h2></div>
              <hr className="th-card-rule" />
              {pays.isPending ? <ListSkeleton rows={3} /> : pays.isError ? <ErrorCard error={pays.error} retry={pays.refetch} />
                : <RecentPayments payments={pays.data ?? []} students={studs.data ?? []} />}
            </div>
          </section>
        </>
      )}
    </>
  );
}

/** 4 quiet botanical-neutral avatar tones, picked from the id so a student always gets the same one. */
const AVATAR_TONES = ['#DDE4DC', '#E5DFD2', '#D9E1DE', '#E4DDD8'];
function avatarTone(id: string) { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AVATAR_TONES[h % AVATAR_TONES.length]; }


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
  const [noteFor, setNoteFor] = useState<Lesson | null>(null);

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
            <div className="tc-day-head">
              <h2 id="tc-day-h">{sel === today ? '今天 · ' : ''}{fmtDate(sel)}{dayLessons.length ? ` · ${dayLessons.length} 堂` : ''}</h2>
              <LeafSprig />
            </div>
            {dayLessons.length ? <ul className="tc-list">{dayLessons.map((l) => {
              const done = isDone(l);
              const canCancel = l.status === 'Booked' && !done;
              return (
                <li key={l.id} className={`tc-row${done ? ' is-done' : ''}${canCancel ? ' is-up' : ''}`}>
                  <span className="tc-time">{l.time}</span>
                  <div className="tc-body">
                    <p className="tc-name">{l.studentName}</p>
                    <p className={`tc-state${done ? ' done' : l.change ? ' warn' : ''}`}>{done ? '已上課' : l.change ? (l.change.by === 'teacher' ? '等學生回覆' : '學生申請改時間') : '已預約'}</p>
                  </div>
                  {/* 課堂筆記: any class that has started, also on past days — Iris can add or redo it later */}
                  {done && (
                    <button type="button" className={`tl-note tc-note${l.noteKind ? ' has-note' : ''}`} onClick={() => setNoteFor(l)}
                      aria-label={`${l.studentName} ${fmtSlot(l.date, l.time)} 的課堂筆記${l.noteKind ? '（已有筆記）' : ''}`}>
                      <Icon name="notebook" size={20} weight={l.noteKind ? 'fill' : 'regular'} />
                      {l.noteKind && <span className="tl-note-dot" aria-hidden="true" />}
                    </button>
                  )}
                  {canCancel && (
                    <div className="tc-acts">
                      {!l.change && <Link to={`/teacher/students/${l.studentId}/propose/${l.id}`} className="tc-btn" aria-label={`提議改時間：${l.studentName} ${fmtSlot(l.date, l.time)}`}>改時間</Link>}
                      <Link to={`lessons/${l.id}/cancel`} className="tc-btn danger" aria-label={`取消 ${l.studentName} ${fmtSlot(l.date, l.time)} 的課`}>取消</Link>
                    </div>
                  )}
                </li>);
            })}</ul> : <Empty text="這天沒有課。" />}
          </section>
        </div>
      )}
      {noteFor && <LessonNoteDialog lesson={noteFor} onClose={() => setNoteFor(null)} />}
      <Outlet />
    </>
  );
}

/** Decorative leaf sprig for the day header (pure SVG, inherits the sage colour). */
function LeafSprig() {
  return (
    <svg className="tc-leaf" viewBox="0 0 120 60" aria-hidden="true" focusable="false">
      <path d="M6 54C34 46 62 30 112 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M38 42c-2-12 6-22 18-24-1 12-8 21-18 24Z" /><path d="M58 32c0-12 9-20 21-20-2 12-10 19-21 20Z" />
      <path d="M80 21c2-11 12-17 23-15-3 11-12 16-23 15Z" /><path d="M46 38c10 4 20 2 26-6-10-3-20-1-26 6Z" opacity=".75" />
      <path d="M70 26c10 3 19 0 24-8-10-2-19 1-24 8Z" opacity=".75" /><path d="M24 48c-4-9 0-18 9-22 2 9-2 18-9 22Z" opacity=".85" />
    </svg>
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
      <div className="inner tc-sheet-sum warn-pulse">
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
            // a big red window instead of a small toast: cancelling is serious, so Iris should clearly see it happened
            .then(() => showDone({
              title: '已取消這堂課', text: `${name} ${slot}，堂數已退回`, undoSeconds: 10,
              undo: async () => { await undo(l.id); },
              onUndone: () => toast({ text: `已復原 ${name} ${slot}，學生不會收到通知` }),
            }))
            .catch((e) => toast({ text: (e as Error).message, kind: 'error' }));
          nav(-1);
        }}>取消這堂課</button>
      <button className="btn secondary block" onClick={() => nav(-1)}>保留這堂課</button>
    </RouteSheet>
  );
}

/* =================== Students =================== */
export function Students() {
  return <StudentsTable />;
}

const payDay = (iso: string) => studioToday(new Date(iso)).replaceAll('-', '/');
const PAY_WORD: Record<PaymentStatus, [string, string]> = { Confirmed: ['ok', '已確認'], Pending: ['wait', '待確認'], Rejected: ['bad', '已退回'] };

/** The coach's workspace for one student: who → course status → next classes → payment → history. */
/** "2025.06.01" (Taipei) */
/** whole months since a date → 學習資歷 "51 月" */
function monthsOf(iso: string) {
  const a = new Date(iso.length === 10 ? `${iso}T12:00:00+08:00` : iso), b = new Date();
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0));
}
const dotDate = (iso: string | null) => (iso ? studioToday(new Date(iso.length === 10 ? `${iso}T12:00:00+08:00` : iso)).replaceAll('-', '.') : '—');

/**
 * File picker for the 個人資料 photo / banner. A <label> wrapping a visually hidden <input type="file">, so it works
 * with mouse, keyboard (Tab → Enter/Space) and screen readers without any JS click() tricks.
 */
function MediaPicker({ id, kind, label, children }: { id: string; kind: 'avatar' | 'cover'; label: string; children: (busy: boolean) => React.ReactNode }) {
  const up = useUploadStudentMedia(id);
  const toast = useToast();
  const pick = (f: File | undefined) => {
    if (!f || up.isPending) return; // one upload at a time
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { toast({ text: '只接受 JPG、PNG 或 WEBP 圖片。', kind: 'error' }); return; }
    if (f.size > 5 * 1024 * 1024) { toast({ text: '圖片不能超過 5 MB。', kind: 'error' }); return; }
    up.mutateAsync({ kind, file: f })
      .then(() => toast({ text: kind === 'avatar' ? '已更新大頭照' : '已更新封面照片' }))
      .catch((e) => toast({ text: (e as Error).message, kind: 'error' }));
  };
  return (
    <label className={`sp-pick is-${kind}${up.isPending ? ' is-busy' : ''}`} title={kind === 'avatar' ? '更換大頭照' : '更換封面照片'}>
      <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" aria-label={label} disabled={up.isPending}
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {children(up.isPending)}
    </label>
  );
}

/** The coach's workspace for one student, laid out like a profile page:
 *  cover + photo → name / email / LINE → 4 key numbers → setting-style rows (label + hint on the left, content on the right). */
export function StudentDetailPage() {
  const { id } = useParams();
  const s = useStudent(id!);
  if (s.isPending) return <PageSkeleton blocks={[120, 140, 160]} />;
  if (s.isError) return <ErrorCard error={s.error} retry={s.refetch} />;
  const d = s.data;
  return (
    <>
      <nav className="st-crumbs sp-crumbs" aria-label="麵包屑"><ol>
        <li><Link to="/teacher" viewTransition>首頁</Link></li>
        <li><Link to="/teacher/students" viewTransition>列表</Link></li>
        <li aria-current="page">個人資料</li>
      </ol></nav>
      <article className="sp" aria-labelledby="sd-name">
        <MediaPicker id={d.id} kind="cover" label={`上傳 ${d.name} 的封面照片`}>
          {(busy) => (
            <div className={`sp-cover${d.coverUrl ? ' has-img' : ''}`} style={d.coverUrl ? { backgroundImage: `url(${d.coverUrl})` } : undefined}>
              <span className="sp-cover-edit" aria-hidden="true">{busy ? <span className="pc-spin" /> : <Icon name="edit" size={18} />}</span>
            </div>
          )}
        </MediaPicker>
        <div className="sp-top">
          <div className="sp-photo-wrap">
            <span className="sp-photo" style={{ background: avatarTone(d.id) }} aria-hidden="true">
              {d.avatarUrl ? <img src={d.avatarUrl} alt="" /> : initial(d.name)}</span>
            {/* camera = "change this photo"; the whole badge is the file picker (44 px target) */}
            <MediaPicker id={d.id} kind="avatar" label={`更換 ${d.name} 的大頭照`}>
              {(busy) => <span className="sp-cam" aria-hidden="true">{busy ? <span className="pc-spin" /> : <Icon name="camera" size={18} />}</span>}
            </MediaPicker>
          </div>
          {/* two icon actions, top right: chat → LINE, bell → 通知學生繳費 */}
          <div className="sp-icons">
            <Link to={`/teacher/students/${d.id}/lessons`} className="sp-ic" viewTransition aria-label={`${d.name} 的課程`} title="課程"><Icon name="lessons" size={22} /></Link>
            {d.lineId
              ? <a className="sp-ic" href={`https://line.me/ti/p/~${encodeURIComponent(d.lineId)}`} target="_blank" rel="noreferrer" aria-label={`用 LINE 聯絡 ${d.name}（另開新視窗）`} title="LINE 通知"><Icon name="msg" size={22} /></a>
              : <span className="sp-ic" aria-disabled="true" title="沒有 LINE"><Icon name="msg" size={22} /></span>}
            <Link to="remind" className={`sp-ic${d.credits <= 1 ? ' urgent' : ''}`} aria-disabled={!d.remindChannel || undefined} title="通知學生繳費"
              aria-label={d.remindChannel ? `通知 ${d.name} 繳學費` : '沒有 LINE 或 Email，無法通知繳費'}
              onClick={(e) => { if (!d.remindChannel) e.preventDefault(); }}><Icon name="bell" size={22} weight={d.credits <= 1 ? 'fill' : 'regular'} /></Link>
          </div>
        </div>
        <div className="sp-id">
          <h1 className="sp-name" id="sd-name">{d.name}<span className={`type-badge ${d.classType}`}>{CLASS_TYPE_LABEL[d.classType]}</span>{d.consent.minor && <span className="sd-minor">未成年</span>}</h1>
          <p className="sp-sub">{d.email ?? '沒有 Email'}</p>
          <p className="sp-sub">{d.lineId ? `LINE ID：${d.lineId}` : '沒有 LINE ID'}</p>
        </div>

        <dl className="sp-stats">
          <div><dt>最初上課</dt><dd>{dotDate(d.firstLessonDate)}</dd></div>
          <div><dt>首次購買課程</dt><dd>{dotDate(d.firstPurchaseAt)}</dd></div>
          <div><dt>購買總額</dt><dd>{`$${d.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</dd></div>
          <div><dt>學習資歷</dt><dd>{d.firstLessonDate ? `${monthsOf(d.firstLessonDate)} 月` : '—'}</dd></div>
        </dl>

        <section className="sp-row" aria-labelledby="sp-acc-h">
          <div className="sp-label"><h2 id="sp-acc-h">個人帳號資訊</h2></div>
          <div className="sp-body">
            <div className="sp-field"><span className="sp-flabel" id="sp-fn">全名</span><p className="sp-fval" aria-labelledby="sp-fn">{d.name}</p></div>
            <div className="sp-field"><span className="sp-flabel" id="sp-lm">登入方式</span>
              <p className="sp-fval" aria-labelledby="sp-lm"><span className={`sp-login ${d.loginMethod}`}>{d.loginMethod === 'line' ? 'LINE' : 'EMAIL'}</span></p></div>
            <Link to="edit" className="sp-btn sp-more">編輯課程類型</Link>
          </div>
        </section>

        <section className="sp-row sp-row-edit" aria-labelledby="sp-about-h">
          <Link to="basics" className="sp-edit" aria-label="編輯聲部與程度" title="編輯聲部與程度"><Icon name="edit" size={20} /></Link>
          <div className="sp-label"><h2 id="sp-about-h">基本資料</h2></div>
          <div className="sp-body">
            <dl className="sp-kv">
              <div><dt>聲部</dt><dd>{d.voiceType ?? '還不確定'}</dd></div>
              <div><dt>程度</dt><dd>{d.grade ?? '未設定'}</dd></div>
              <div><dt>電話</dt><dd>{d.phone ?? '—'}</dd></div>
            </dl>
            {/* 肖像授權: silent when the student agreed (the normal case). A line appears only when Iris must NOT post
                — not agreed, or withdrawn — because that is the one time it changes what she does. */}
            {!d.consent.media && (
              <p className={`sd-consent ${d.consent.mediaWithdrawn ? 'warn' : ''}`}>
                {d.consent.mediaWithdrawn ? `已撤回肖像影音授權${d.consent.mediaAt ? `（${new Date(d.consent.mediaAt).toLocaleDateString('zh-TW')}）` : ''}，請移除已公開的內容` : '未同意肖像影音宣傳，請勿公開照片或影片'}
              </p>
            )}
          </div>
        </section>

      </article>
      <Outlet />
    </>
  );
}



/* =================== 課程 (one student) — the teacher's 課程中心 for this student =================== */
const EN_WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const enWeekday = (d: string) => EN_WD[new Date(`${d}T12:00:00+08:00`).getUTCDay()];
const SKILL_IDEAS = ['呼吸', 'Riffing', 'Belting', 'Chest voice', 'Head voice', 'Mix', 'Airy', '咬字', '音準', '節奏'];

export function StudentLessonsPage() {
  const { id } = useParams();
  const s = useStudent(id!);
  const [note, setNote] = useState(false);
  // remembered per browser, so Iris finds it the way she left it (storage can be blocked → just default open)
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('iris.lc.open') !== '0'; } catch { return true; } });
  const toggle = () => setOpen((o) => { try { localStorage.setItem('iris.lc.open', o ? '0' : '1'); } catch { /* ignore */ } return !o; });
  if (s.isPending) return <PageSkeleton blocks={[100, 160, 160]} />;
  if (s.isError) return <ErrorCard error={s.error} retry={s.refetch} />;
  const d = s.data;
  const next = d.upcoming[0];
  const recent = d.past.slice(0, 3);
  return (
    <>
      <nav className="st-crumbs sp-crumbs" aria-label="麵包屑"><ol>
        <li><Link to="/teacher" viewTransition>首頁</Link></li>
        <li><Link to="/teacher/students" viewTransition>列表</Link></li>
        <li aria-current="page">課程</li>
      </ol></nav>
      <article className="lc" aria-labelledby="lc-name">
        <header className="lc-head">
          <h1 className="lc-name" id="lc-name">{d.name}</h1>
          <p className="lc-sub">{CLASS_TYPE_LABEL[d.classType]} · {d.totalLessons} 堂課</p>
        </header>

        <div className="lc-top">
          <section className="lc-col" aria-labelledby="lc-goal-h">
            <h2 className="lc-h" id="lc-goal-h">學習目標</h2>
            <p className={`lc-goal${d.goal ? '' : ' empty'}`}>{d.goal || '學生還沒有填寫學習目標。'}</p>
          </section>
          <SkillBadges id={d.id} skills={d.skills} />
          <section className="lc-col lc-stats" aria-label="課程數字">
            <div><p className="lc-k">剩餘 <Link to="adjust" className="lc-mini">調整</Link></p><p className="lc-v"><b className={d.credits === 0 ? 'out' : d.credits === 1 ? 'low' : ''}>{d.credits}</b> 堂課</p></div>
            <div><p className="lc-k">總堂數</p><p className="lc-v"><b>{d.totalLessons}</b> 堂課</p></div>
            <GrowthStat id={d.id} level={d.growthLevel} />
            <div><p className="lc-k">缺課</p><p className="lc-v"><b className={d.missed ? 'low' : ''}>{d.missed}</b> 缺課</p></div>
          </section>
        </div>

      </article>

      {/* 課程中心 = a tab outside the white card that rolls its two cards up / down */}
      <section className={`lc-center${open ? '' : ' is-rolled'}`} aria-labelledby="lc-center-h">
        <h2 className="lc-tabh">
          <button type="button" id="lc-center-h" className="lc-tab" aria-expanded={open} aria-controls="lc-roll" onClick={toggle}>
            <span>課程中心</span>
            <span className="lc-tab-ic" aria-hidden="true"><Icon name="chevDown" size={20} weight="bold" /></span>
            <span className="sr-only">{open ? '（收起）' : '（展開）'}</span>
          </button>
        </h2>
        <div className="lc-roll" id="lc-roll" inert={!open || undefined}>
          <div className="lc-roll-in">
          <div className="lc-grid">
            <div className="lc-hist">
              <div className="lc-row-h"><h3 className="lc-h3">上課紀錄</h3>
                {d.past.length > 0 && <Link to="history" className="lc-arrow" aria-label={`查看 ${d.name} 全部上課紀錄`}><Icon name="arrow" size={18} /></Link>}</div>
              <hr className="lc-rule" />
              <HistoryList d={d} items={recent} />
            </div>
            <div className="lc-next">
              <div className="lc-row-h"><h3 className="lc-h3">下一堂課</h3></div>
              <hr className="lc-rule" />
              {next ? (
                <div className="lc-nx">
                  <div className="lc-nx-acts">
                    {next.change
                      ? <span className="lc-pill wait">{next.change.by === 'teacher' ? '等學生回覆' : '學生申請改時間'}</span>
                      : <Link to={`propose/${next.id}`} className="lc-pill">改時間</Link>}
                    <button type="button" className="lc-pill" onClick={() => setNote(true)}>筆記</button>
                  </div>
                  <p className="lc-wd" aria-hidden="true">{enWeekday(next.date).slice(0, 3).toUpperCase()}</p>
                  <div className="lc-when" aria-hidden="true">
                    <p className="lc-date">{next.date}</p>
                    <p className="lc-time">{next.time}</p>
                  </div>
                  <span className="sr-only">{fmtSlot(next.date, next.time)}</span>
                </div>
              ) : <p className="lc-empty">目前沒有預約的課。課程由學生自己預約。</p>}
            </div>
          </div>
          </div>
        </div>
      </section>
      {note && <NoteDialog s={d} kind="note" onClose={() => setNote(false)} />}
      <Outlet />
    </>
  );
}

/** ✓ Attended · ↻ moved once (改時間 approved) · ✕ cancelled through 回報 */
function HistoryList({ d, items }: { d: StudentDetail; items: Lesson[] }) {
  if (!items.length) return <p className="lc-empty">還沒有上過課。</p>;
  return (
    <ul className="lc-hl">
      {items.map((l) => {
        const kind = l.status !== 'Attended' ? 'x' : d.movedLessonIds.includes(l.id) ? 'moved' : 'ok';
        return (
          <li key={l.id} className={`is-${kind}`}>
            <span className="lc-hi" aria-hidden="true"><Icon name={kind === 'x' ? 'x' : kind === 'moved' ? 'reschedule' : 'check'} size={16} weight="bold" /></span>
            <span className="lc-hd">{enWeekday(l.date)}, {l.date}</span>
            <span className="lc-ht">{l.time}</span>
            <span className="sr-only">{kind === 'x' ? '已取消（回報）' : kind === 'moved' ? '改過時間，已上課' : '已上課'}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** 上課紀錄 › all (sheet) */
export function LessonHistorySheet() {
  const { id } = useParams();
  const s = useStudent(id!);
  if (!s.data) return null;
  return <RouteSheet title={`上課紀錄 · ${s.data.name}`}><HistoryList d={s.data} items={s.data.past} /></RouteSheet>;
}

/** 技能徽章: ＋ 新增 to add (type or pick an idea), × on a badge removes it. Saved at once (optimistic). */
function SkillBadges({ id, skills }: { id: string; skills: string[] }) {
  const save = useSaveSkills(id);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const put = (list: string[], msg?: string) => save.mutate(list, { onSuccess: () => { if (msg) toast({ text: msg }); }, onError: (e) => toast({ text: (e as Error).message, kind: 'error' }) });
  const add = (v: string) => {
    const t = v.trim();
    if (!t) return;
    if (skills.includes(t)) { toast({ text: `「${t}」已經有了`, kind: 'warning' }); return; }
    if (skills.length >= 12) { toast({ text: '最多 12 個徽章', kind: 'warning' }); return; }
    put([...skills, t]); setText('');
  };
  return (
    <section className="lc-col" aria-labelledby="lc-skill-h">
      <div className="lc-row-h"><h2 className="lc-h" id="lc-skill-h">技能徽章</h2>
        <button type="button" className="lc-mini" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>{adding ? '完成' : '＋ 新增'}</button></div>
      <ul className="lc-badges">
        {skills.map((k) => (
          <li key={k} className="lc-badge">{k}
            <button type="button" aria-label={`移除 ${k}`} onClick={() => put(skills.filter((x) => x !== k), `已移除「${k}」`)}><Icon name="x" size={12} weight="bold" /></button>
          </li>
        ))}
        {!skills.length && !adding && <li className="lc-empty">還沒有徽章。</li>}
      </ul>
      {adding && (
        <div className="lc-add">
          <form onSubmit={(e) => { e.preventDefault(); add(text); }} className="lc-add-row">
            <label className="sr-only" htmlFor="lc-skill">新的徽章</label>
            <input id="lc-skill" className="input" maxLength={20} value={text} onChange={(e) => setText(e.target.value)} placeholder="例如：Belting" autoFocus />
            <button className="st-btn dark" disabled={!text.trim()}>加入</button>
          </form>
          <div className="lc-ideas">{SKILL_IDEAS.filter((x) => !skills.includes(x)).map((x) => <button type="button" key={x} className="lc-idea" onClick={() => add(x)}>＋ {x}</button>)}</div>
        </div>
      )}
    </section>
  );
}

/** 成長等級 0–10 with an (i) that explains it, and 編輯 → small stepper + 儲存 */
function GrowthStat({ id, level }: { id: string; level: number }) {
  const save = useSaveGrowth(id);
  const flow = useSaveFlow();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(level);
  const [info, setInfo] = useState(false);
  return (
    <div className="lc-growth">
      <p className="lc-k">成長等級
        <button type="button" className="lc-info" aria-expanded={info} aria-label="成長等級是什麼？" onClick={() => setInfo((x) => !x)}><Icon name="info" size={15} /></button>
        {!edit && <button type="button" className="lc-mini" onClick={() => { setV(level); setEdit(true); }}>編輯</button>}</p>
      {info && <p className="lc-tip" role="note">老師依學生的進步評的等級（0–10），只有老師看得到。</p>}
      {edit ? (
        <div className="lc-step">
          <button type="button" aria-label="降一級" disabled={v <= 0 || flow.busy} onClick={() => setV(v - 1)}><Icon name="minus" size={16} /></button>
          <span className="lc-v" aria-live="polite"><b>{v}</b> 級</span>
          <button type="button" aria-label="升一級" disabled={v >= 10 || flow.busy} onClick={() => setV(v + 1)}><Icon name="plus" size={16} /></button>
          <SaveButton state={flow.state} type="button" className="st-btn dark lc-save" disabled={v === level}
            onClick={() => { flow.run(() => save.mutateAsync(v), () => { setEdit(false); toast({ text: `成長等級改為 ${v} 級` }); }).catch((e) => toast({ text: (e as Error).message, kind: 'error' })); }} />
          <button type="button" className="lc-mini" disabled={flow.busy} onClick={() => setEdit(false)}>取消</button>
        </div>
      ) : <p className="lc-v"><b>{level}</b> 級</p>}
    </div>
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
      .then(() => { toast({ text: `已傳送給${name}，等學生回覆` }); nav(`/teacher/students/${id}/lessons`, { replace: true }); })
      .catch((e) => toast({ text: (e as Error).message, kind: 'error' }));
  };
  return (
    <RouteSheet title={`提議改時間 · ${d.name}`} dismissible={!propose.isPending}>
      <SlotCompare from={{ date: l.date, time: l.time }} fromLabel="目前時段" fromHint="保留到學生同意"
        to={date && time ? { date, time } : null} toLabel="提議時段" />
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
        <textarea id="rm-msg" placeholder="寫給學生的提醒內容" className="input rm-msg" rows={5} maxLength={500} value={draft} onChange={(e) => setMsg(e.target.value)} />
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
  const flow = useSaveFlow();
  const save = () => {
    const name = d.name;
    flow.run(() => adjust.mutateAsync({ delta, reason }), () => {
      nav(-1);
      toast({ text: `${name} ${delta > 0 ? '+' : '−'}${Math.abs(delta)} 堂（已記錄並通知）`, undo: () => adjust.mutateAsync({ delta: -delta, reason: '復原上一次調整' }).then(() => undefined) });
    }).catch((e) => toast({ text: (e as Error).message, kind: 'error' }));
  };
  return (
    <RouteSheet title="調整堂數" dismissible={!flow.busy}>
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
      <SaveButton state={flow.state} type="button" label="儲存調整" disabled={!ready} onClick={save} />
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
  const [cx, setCx] = useState<boolean | null>(null);
  const d = s.data;
  if (!d) return null;
  const cur = t ?? d.classType;
  const done = cx ?? !!d.consultationCompleted;
  const unchanged = cur === d.classType && done === !!d.consultationCompleted;
  const flow = useSaveFlow();
  return (
    <RouteSheet title={`編輯 ${d.name}`}>
      <fieldset className="adj-field"><legend>課程類型</legend>
        <div className="fchips" role="radiogroup" aria-label="課程類型">
          {(['private', 'group', 'trial'] as const).map((k) => <button key={k} role="radio" aria-checked={cur === k} className="fchip" onClick={() => setT(k)}>{CLASS_TYPE_LABEL[k]}</button>)}
        </div>
      </fieldset>
      <label className="au-ck"><input type="checkbox" checked={done} onChange={(e) => setCx(e.target.checked)} /><span>已完成諮詢／面談（可購買一次單堂課 NT$1,500）</span></label>
      <SaveButton state={flow.state} type="button" disabled={unchanged}
        onClick={() => {
          const name = d.name;
          flow.run(() => (cur === d.classType ? Promise.resolve() : setType.mutateAsync(cur))
            .then(() => (done === !!d.consultationCompleted ? null : api.patch(`/api/teacher/students/${id}/consultation`, { consultationCompleted: done }))),
          () => { s.refetch(); nav(-1); toast({ text: `${name} 已更新` }); })
            .catch((e) => toast({ text: (e as Error).message, kind: 'error' }));
        }} />
      <button className="btn secondary block" disabled={flow.busy} onClick={() => nav(-1)}>取消</button>
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
          <span className={`sd-dot ${PAY_WORD[p.status][0]}`}>{PAY_WORD[p.status][1]}</span></li>))}</ul>
    </RouteSheet>
  );
}

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
    { to: '/teacher/requests', label: '申請', n: c ? c.changes + c.reports + c.applications : 0 },
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

/** 帳號狀態 row on the account-approval card: information only (not a button), full width, above the actions */
const ACCOUNT_STATUS = { pending: '待確認', approved: '已確認', rejected: '已婉拒' } as const;
function AccountStatusRow({ status }: { status: keyof typeof ACCOUNT_STATUS }) {
  // 待確認 waits for Iris → it pulses to catch her eye (only this one: 等待回覆 waits for the student, so it stays still)
  return <StatusRow label="帳號狀態" tone={status} text={ACCOUNT_STATUS[status]} pulse={status === 'pending'} />;
}
/** A2 Soft Surface status row, shared by 新學生 · 改時間 · 等學生回覆: label left, ● value right. Not interactive. */
function StatusRow({ label, tone, text, id, pulse }: { label: string; tone: 'pending' | 'approved' | 'rejected'; text: string; id?: string; pulse?: boolean }) {
  return (
    <div className={`ap-status is-${tone}${pulse ? ' is-pulse' : ''}`} id={id}>
      <span className="ap-status-k">{label}</span>
      <span className="ap-status-v"><span className="ap-dot" aria-hidden="true" />{text}</span>
    </div>
  );
}

/** /teacher/inbox: open the tab that has work waiting (申請 → 付款 → 諮詢), else 申請 */
export function InboxIndex() {
  const ov = useOverview();
  const c = ov.data?.counts;
  if (ov.isPending) return <PageSkeleton />;
  const to = !c || c.changes + c.reports + c.applications ? '/teacher/requests' : c.receipts ? '/teacher/payments' : c.consults ? '/teacher/consults' : '/teacher/requests';
  return <Navigate to={to} replace />;
}

/* =================== 更多 =================== */
const statusLabelOf = (t: TeacherPublic) => (t.status === 'custom' ? t.statusLabel ?? '自訂' : TEACHER_STATUS_LABEL[t.status]);

export function TeacherMore() {
  const me = useCurrentUser();
  const studio = useStudio();
  const logout = useLogout();
  const nav = useNavigate();
  // one row = one existing page; nothing here is new functionality
  const row = (to: string, icon: string, title: string, sub: string) => (
    <li><Link to={to} className="mo-row" viewTransition>
      <span className="mo-ic" aria-hidden="true"><Icon name={icon} size={22} /></span>
      <span className="mo-body"><span className="mo-t">{title}</span><span className="mo-s">{sub}</span></span>
      <span className="mo-chev" aria-hidden="true"><Icon name="chev" size={18} /></span>
    </Link></li>
  );
  const group = (id: string, icon: string, title: string, rows: React.ReactNode) => (
    <section className="mo-group" aria-labelledby={id}>
      <h2 className="mo-gh" id={id}><Icon name={icon} size={20} />{title}</h2>
      <ul className="mo-list">{rows}</ul>
    </section>
  );
  return (
    <div className="mo-page">
      <h1 className="sr-only">更多</h1>
      <section className="mo-group" aria-labelledby="mo-g0">
        <h2 className="mo-gh" id="mo-g0"><Icon name="idCard" size={20} />個人資料</h2>
        <Link to="/teacher/profile" className="mo-me" viewTransition>
        <span className="avatar">{studio.data?.teacher.avatarUrl ? <img src={studio.data.teacher.avatarUrl} alt="" /> : initialOf(me.name)}</span>
        <span className="mo-body"><span className="mo-t">{me.name}</span><span className="mo-s">教師個人資料 · 狀態：{studio.data ? statusLabelOf(studio.data.teacher) : '…'}</span></span>
        <span className="mo-chev" aria-hidden="true"><Icon name="chev" size={18} /></span>
        </Link>
      </section>
      {group('mo-g1', 'calendar', '課程相關', <>
        {row('/teacher/availability', 'calendar', '可預約時段', '每週時段、特殊日期')}
        {row('/teacher/more/packages', 'lessons', '課程方案', '堂數與價格，可自行調整')}
        {row('/teacher/more/reels', 'reel', 'IG Reels', '網站「精彩片段」的影片，最多 8 則')}
      </>)}
      {group('mo-g2', 'user', '帳號與設定', <>
        {row('/teacher/availability?tab=settings', 'gear', '設定', '每堂課時長、課程間隔、可提前預約')}
      </>)}
      {group('mo-g3', 'shield', '支援與法律', <>
        {row('/teacher/privacy-requests', 'info', '個資權利申請', '查詢、更正、刪除、撤回同意 · 法定期限內回覆')}
        {row('/legal/privacy', 'shield', '法律與隱私文件', '服務條款、隱私權政策等（草案）')}
      </>)}
      <button type="button" className="mo-out" onClick={() => { nav('/'); logout.mutate(); }}>
        <span className="mo-ic" aria-hidden="true"><Icon name="logout" size={22} /></span><span className="mo-t">登出</span>
      </button>
      <Outlet />
    </div>
  );
}

/* =================== 個資權利申請 (teacher) =================== */
const PRIV_LABEL: Record<PrivacyRequestType, string> = { access: '查詢或閱覽', copy: '製給複製本', correct: '補充或更正', stop: '停止蒐集處理利用', delete: '刪除', withdraw: '撤回同意' };

/** 個資法 §13: 15 days (查詢/閱覽/複本) or 30 days (更正/停止/刪除) to decide. The due date leads each card. */
export function PrivacyRequestsPage() {
  const q = usePrivacyRequests();
  const done = useMarkPrivacyDone();
  const flow = useSaveFlow();
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
                  ? <p className="rq-status ok">已處理 · {p.note}</p>
                  : <p className={`rq-status ${left < 0 ? 'bad' : left <= 3 ? 'wait' : ''}`}>{left < 0 ? `已逾期 ${-left} 天` : `${fmtDate(p.dueAt.slice(0, 10))} 前需回覆（剩 ${left} 天）`}</p>}
                {p.status === 'open' && open !== p.id && <div className="rq-actions"><button className="rq-btn rq-approve" onClick={() => { setOpen(p.id); setNote(''); }}>標為已處理</button></div>}
              </div>
              {open === p.id && (
                <form className="pr-done" onSubmit={(e) => { e.preventDefault(); flow.run(() => done.mutateAsync({ id: p.id, note }), () => { setOpen(null); toast({ text: '已記錄處理結果' }); }).catch((er) => toast({ text: (er as Error).message, kind: 'error' })); }}>
                  <div className="field"><label htmlFor={`pn-${p.id}`}>處理結果（會保存作為紀錄）</label>
                    <textarea id={`pn-${p.id}`} className="input" required maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：已於 11/10 以 Email 提供資料複本" /></div>
                  <div className="rq-actions"><button type="button" className="rq-btn rq-decline" disabled={flow.busy} onClick={() => setOpen(null)}>取消</button>
                    <SaveButton state={flow.state} className="rq-btn rq-approve" disabled={!note.trim()} /></div>
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
  const flow = useSaveFlow();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setSaved(false); };
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const customBad = f.status === 'custom' && !f.statusLabel.trim();
  // the preview is built from the form, not from the server: Iris sees the result before she saves
  const preview: TeacherPublic = { name: f.name.trim() || p.name, avatarUrl: p.avatarUrl, status: f.status, statusLabel: f.statusLabel, statusMessage: f.statusMessage.trim() || null, lineId: f.lineIdPublic && f.lineId.trim() ? f.lineId.trim() : null };

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || customBad) return;
    flow.run(() => save.mutateAsync({ name: f.name, lineId: f.lineId || null, lineIdPublic: f.lineIdPublic, status: f.status, statusLabel: f.statusLabel || null, statusMessage: f.statusMessage || null }),
      (r) => { setF({ name: r.name, lineId: r.lineId ?? '', lineIdPublic: r.lineIdPublic, status: r.status, statusLabel: r.statusLabel ?? '', statusMessage: r.statusMessage ?? '' }); setSaved(true); toast({ text: '已儲存，學生現在看到的是新的資料' }); })
      .catch((er) => toast({ text: (er as Error).message, kind: 'error' }));
  };
  const onPhoto = (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast({ text: '照片不能超過 2 MB。', kind: 'warning' }); return; }
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
            <input id="tp-name" placeholder="例如：Iris 老師" className="input" required maxLength={40} autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
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

        <SaveButton state={flow.state} label={saved && !dirty ? '✓ 已儲存' : '儲存'} disabled={!dirty || customBad} />
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
          {p.email && <p className={`tp-badge ${p.emailVerified ? 'ok' : 'warn'}`}>{p.emailVerified ? '已驗證' : '待驗證 · 請到信箱點驗證連結'}</p>}</div>
        {!edit && <button className="btn secondary sm" onClick={() => { setEdit(true); setEmail(p.email ?? ''); }}>變更</button>}
      </div>
      {edit && (
        <form className="tp-email" onSubmit={(e) => { e.preventDefault(); changeEmail.mutateAsync({ email, password: pw }).then(() => { setEdit(false); setPw(''); toast({ text: '已更新 Email，請到新信箱完成驗證' }); }).catch(fail); }}>
          <div className="field"><label htmlFor="tp-em">新的 Email</label><input id="tp-em" placeholder="name@example.com" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="tp-pw">目前的密碼</label><input id="tp-pw" placeholder="輸入目前的密碼" className="input" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
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
          <p className={`tp-badge ${p.lineLinked ? 'ok' : 'off'}`}>{p.lineLinked ? '已綁定' : '尚未綁定'}</p>
          {!p.lineLinked && <p className="tp-hint">綁定後可以用 LINE 一鍵登入。LINE Login 設定完成後開放。</p>}</div>
        {p.lineLinked
          ? <button className="btn secondary sm" disabled={unlinkLine.isPending} onClick={() => unlinkLine.mutateAsync().then(() => toast({ text: '已解除 LINE 綁定' })).catch(fail)}>解除</button>
          : <button className="btn secondary sm" disabled aria-describedby="tp-acc-h">綁定</button>}
      </div>
    </section>
  );
}

/** 課程方案: Iris edits sizes + prices herself. What she saves is what students see on 堂數與付款.
 *  Receipts already uploaded keep the price they were sent with (the payment stores its own amount). */
type PkgDraft = { key: string; size: string; price: string; trial: boolean };
const toDraft = (p: { size: number; price: number; trial?: boolean }, i: number): PkgDraft => ({ key: `${i}-${p.size}`, size: String(p.size), price: String(p.price), trial: !!p.trial });
function pkgProblem(rows: PkgDraft[]): Record<string, string> {
  const err: Record<string, string> = {};
  const sizes = rows.map((r) => Number(r.size));
  rows.forEach((r, i) => {
    const n = Number(r.size), pr = Number(r.price);
    if (!r.trial && (!/^\d+$/.test(r.size) || n < 1 || n > 100)) err[`${r.key}-size`] = '堂數要在 1–100 之間';
    else if (!r.trial && sizes.indexOf(n) !== i) err[`${r.key}-size`] = '堂數重複了';
    if (r.price === '') err[`${r.key}-price`] = ''; // empty: blocks 儲存, but no red text while she is still typing
    else if (!/^\d+$/.test(r.price) || pr < 1 || pr > 500000) err[`${r.key}-price`] = '請輸入 1–500,000 的金額';
  });
  return err;
}
export function PackagesSheet() {
  const studio = useStudio();
  const save = useSavePackages();
  const toast = useToast();
  const nav = useNavigate();
  const saved = studio.data?.packages ?? [];
  const [rows, setRows] = useState<PkgDraft[] | null>(null);
  const list = rows ?? saved.map(toDraft);
  const errs = pkgProblem(list);
  const ok = Object.keys(errs).length === 0 && list.some((r) => !r.trial);
  const dirty = JSON.stringify(list.map((r) => [r.size, r.price, r.trial])) !== JSON.stringify(saved.map((p) => [String(p.size), String(p.price), !!p.trial]));
  const set = (key: string, patch: Partial<PkgDraft>) => setRows(list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const digits = (v: string) => v.replace(/[^\d]/g, '').slice(0, 6);
  const add = () => {
    const used = new Set(list.map((r) => Number(r.size)));
    const next = [4, 8, 12, 16, 20, 24].find((n) => !used.has(n)) ?? Math.max(...list.map((r) => Number(r.size) || 0)) + 1;
    setRows([...list, { key: `new-${Date.now()}`, size: String(next), price: '', trial: false }]);
    window.setTimeout(() => document.querySelector<HTMLInputElement>('.pk-row:last-child .pk-price input')?.focus(), 30);
  };
  const flow = useSaveFlow();
  const submit = () => {
    if (!ok || !dirty) return;
    flow.run(() => save.mutateAsync(list.map((r) => ({ size: r.trial ? 1 : Number(r.size), price: Number(r.price), ...(r.trial ? { trial: true } : {}) }))),
      () => { setRows(null); nav(-1); toast({ text: '課程方案已更新，學生馬上看得到' }); })
      .catch((e) => toast({ text: (e as Error).message, kind: 'error' }));
  };
  const each = (r: PkgDraft) => (Number(r.size) > 0 && Number(r.price) > 0 ? `每堂 ${fmtMoney(Math.round(Number(r.price) / Number(r.size)))}` : '');
  return (
    <RouteSheet title="課程方案" dismissible={!flow.busy}>
      <ul className="pk-list">
        {list.map((r) => (
          <li key={r.key} className="pk-row">
            <div className="pk-name">
              {r.trial ? <><b>單堂課 · 1 堂</b><small>完成諮詢的學生，限購一次</small></> : (
                <label className="pk-size"><input inputMode="numeric" aria-label="堂數" value={r.size} aria-invalid={!!errs[`${r.key}-size`]}
                  onChange={(e) => set(r.key, { size: digits(e.target.value).slice(0, 3) })} /><span>堂</span></label>
              )}
              {!r.trial && <small>{errs[`${r.key}-size`] ? <span className="pk-err">{errs[`${r.key}-size`]}</span> : each(r)}</small>}
            </div>
            <div className="pk-price-col">
              <label className="pk-price"><span>NT$</span><input inputMode="numeric" aria-label={`${r.trial ? '單堂課' : `${r.size} 堂`}價格`} value={r.price} placeholder="價格"
                aria-invalid={!!errs[`${r.key}-price`]} onChange={(e) => set(r.key, { price: digits(e.target.value) })} /></label>
              {errs[`${r.key}-price`] && <small className="pk-err">{errs[`${r.key}-price`]}</small>}
            </div>
            {!r.trial && list.filter((x) => !x.trial).length > 1
              ? <button type="button" className="pk-del" aria-label={`刪除 ${r.size} 堂方案`} onClick={() => setRows(list.filter((x) => x.key !== r.key))}><Icon name="x" size={16} /></button>
              : <span className="pk-del-sp" aria-hidden="true" />}
          </li>
        ))}
      </ul>
      {list.length < 8 && <button type="button" className="pk-add" onClick={add}><Icon name="plus" size={16} />新增方案</button>}
      <p className="caption">儲存後學生馬上看到新價格。已上傳的收據維持原本的金額，不會受影響。</p>
      <SaveButton state={flow.state} type="button" disabled={!ok || !dirty} onClick={submit} />
      <button className="btn secondary block" disabled={flow.busy} onClick={() => nav(-1)}>{dirty ? '取消' : '關閉'}</button>
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
  const changes = req.data?.changes ?? [], apps = req.data?.applications ?? [], props = req.data?.proposals ?? [], reports = req.data?.reports ?? [];
  const rep = useDecideReport();
  const studio = useStudio();
  const fee = studio.data?.cancelFee ?? 500;
  // per-card "免收取消費" tick (illness, emergency…) — off by default, so the studio rule is the normal case
  const [waive, setWaive] = useState<Record<string, boolean>>({});
  const waiting = props.filter((p) => p.status === 'open'), answered = props.filter((p) => p.status !== 'open');
  // sub-tab lives in the URL (?tab=), so the home card 新學生 → ?tab=apps and the back button keep working
  type Sub = 'changes' | 'reports' | 'apps' | 'waiting';
  const q = sp.get('tab');
  const tab: Sub = q === 'apps' || q === 'waiting' || q === 'reports' ? q : 'changes';
  const setTab = (t: Sub) => setSp(t === 'changes' ? {} : { tab: t }, { replace: true });
  const { withdraw } = useProposals();
  const fail = (e: unknown) => toast({ text: (e as Error).message, kind: 'error' });

  // Open requests + the ones Iris just decided (they stay in place as 已同意 / 已婉拒, without buttons).
  const recent = useRecentDecisions();
  const changeItems = useMemo(() => {
    const byId = new Map<string, { c: ChangeRequest; d?: Decision }>(changes.map((c) => [c.id, { c }]));
    for (const d of recent) byId.set(d.c.id, { c: d.c, d });
    return [...byId.values()].sort((x, y) => x.c.createdAt.localeCompare(y.c.createdAt));
  }, [changes, recent]);
  const anySaving = recent.some((d) => d.status === 'saving');

  // 同意改期: the server re-checks the slot inside the transaction (409 slot_taken), so two approvals can never
  // land on one slot even if this list is stale. The store entry doubles as a double-tap guard — it's set
  // synchronously, before React re-renders the disabled button.
  const approve = (c: ChangeRequest) => {
    if (recentDecisions.has(c.id)) return;
    recentDecisions.set(c.id, { c, status: 'saving' });
    ch.mutation.mutateAsync({ id: c.id, approve: true }).then(() => {
      recentDecisions.set(c.id, { c, status: 'approved' });
      toast({ text: `已同意改期，10 秒後通知${c.studentName}`, undo: () => ch.undo(c.id).then(() => recentDecisions.set(c.id, null), fail) });
    }, (e) => { recentDecisions.set(c.id, null); fail(e); }); // card comes back; a 409 refetch shows it as 時段衝突
  };

  const changeCard = ({ c, d }: { c: ChangeRequest; d?: Decision }) => {
    const saving = d?.status === 'saving';
    const decided = d && d.status !== 'saving' ? d.status : null;
    const status: RescheduleStatus = decided ?? (c.slotFree ? 'available' : 'conflict');
    const sub = decided === 'approved' ? '已改到新時段 · 會通知學生' : decided === 'declined' ? '維持原時段 · 會通知學生' : `${fmtRelative(c.createdAt)} 申請`;
    return (
      <RescheduleCard key={c.id} id={c.id} name={c.studentName} sub={sub} status={status} busy={saving}
        from={{ date: c.fromDate, time: c.fromTime }} to={{ date: c.toDate, time: c.toTime }} reason={c.reason || undefined}
        statusInfo={status === 'conflict' ? '新時段已有其他預約，請學生重新選擇時段。' : undefined}
        actions={!decided && <>
          <Link to={`${c.id}/decline`} className={`rs-btn rs-decline${saving ? ' is-off' : ''}`} aria-disabled={saving || undefined}
            onClick={(e) => { if (saving) e.preventDefault(); }} aria-describedby={status === 'conflict' ? `rs-tip-${c.id}` : undefined}>婉拒</Link>
          {status === 'available' && <SaveButton type="button" label="同意改期" className="rs-btn rs-approve" state={saving ? 'saving' : 'idle'}
            disabled={anySaving} onClick={() => approve(c)} />}
        </>} />
    );
  };
  const changeCards = changeItems.length > 0 && <div className="rq-group rs-list" key="changes">{changeItems.map(changeCard)}</div>;
  const reportCards = reports.length > 0 && (
    <div className="rq-group" key="reports">
      <div className="rq-list">{reports.map((x) => {
        const w = !!waive[x.id];
        return (
          <article className="rq" key={x.id} aria-labelledby={`rp-${x.id}`}>
            <header className="rq-who">
              <span className="avatar rq-avatar" aria-hidden="true">{initial(x.studentName)}</span>
              <div className="rq-who-text">
                <h4 className="rq-name" id={`rp-${x.id}`}>{x.studentName}</h4>
                <p className="rq-sub">{fmtRelative(x.createdAt)} 回報 · 想取消已上過的課</p>
              </div>
            </header>
            <p className="rq-time"><span className="rq-new"><span className="sr-only">課程 </span>{fmtSlot(x.date, x.time)}</span><span className="rq-sub">（已記為已上課）</span></p>
            {x.reason && <p className="rq-reason">「{x.reason}」</p>}
            <p className="rp-effect">同意：<b>退回 1 堂</b>{w ? '，不收取消費' : <>，下次繳費加收取消費 <b>{fmtMoney(fee)}</b></>}</p>
            <label className="rp-waive"><input type="checkbox" checked={w} onChange={(e) => setWaive((m) => ({ ...m, [x.id]: e.target.checked }))} />這次免收取消費</label>
            <div className="rq-foot">
              <p className="rq-status wait">待審核</p>
              <div className="rq-actions">
                <Link to={`reports/${x.id}/decline`} className="rq-btn rq-decline">婉拒</Link>
                <button className="rq-btn rq-approve" disabled={rep.mutation.isPending}
                  onClick={() => rep.mutation.mutate({ id: x.id, approve: true, waiveFee: w, key: newIdempotencyKey() }, {
                    onSuccess: () => toast({ text: `已同意，退回 1 堂${w ? '' : `，取消費 ${fmtMoney(fee)}`} · 10 秒後通知${x.studentName}`, undo: () => rep.undo(x.id) }), onError: fail })}>同意</button>
              </div>
            </div>
          </article>
        );
      })}</div>
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
              <p className="rq-sub ap-email">{a.email ? a.email : '使用 LINE 註冊'}</p>
              <p className="rq-sub ap-when">{fmtRelative(a.createdAt)} 申請</p>
            </div>
          </header>
          <div className="rq-foot ap-foot">
            <AccountStatusRow status="pending" />
            <div className="rq-actions">
              <button className="rq-btn rq-decline" disabled={app.mutation.isPending} onClick={() => app.mutation.mutate({ id: a.id, approve: false }, { onSuccess: () => toast({ text: `已婉拒${a.name}`, undo: () => app.undo(a.id) }), onError: fail })}>婉拒</button>
              <button className="rq-btn rq-approve" disabled={app.mutation.isPending} onClick={() => app.mutation.mutate({ id: a.id, approve: true }, { onSuccess: () => toast({ text: `已確認${a.name}的帳號`, undo: () => app.undo(a.id) }), onError: fail })}>確認</button>
            </div>
          </div>
        </article>))}</div>
    </div>
  );
  const PROP_STATUS = { open: 'pending', approved: 'approved', declined: 'declined' } as const;
  const propRow = (p: (typeof props)[number]) => (
    <li key={p.id} className="rs-li">
      <RescheduleCard id={`p-${p.id}`} name={p.studentName} status={PROP_STATUS[p.status as keyof typeof PROP_STATUS] ?? 'declined'}
        sub={p.status === 'open' ? `${fmtRelative(p.createdAt)} 傳送提議` : p.status === 'approved' ? '學生已同意，已改時間' : '學生不方便，維持原時間'}
        from={{ date: p.fromDate, time: p.fromTime }} to={{ date: p.toDate, time: p.toTime }} toLabel="提議改至"
        reasonLabel="你的說明" reason={p.message || undefined}
        actions={p.status === 'open'
          ? <button className="rs-btn rs-decline" disabled={withdraw.isPending} onClick={() => withdraw.mutateAsync(p.id).then(() => toast({ text: '已收回提議' })).catch(fail)}>收回提議</button>
          : p.status === 'declined' ? <Link to={`/teacher/students/${p.studentId}/propose/${p.lessonId}`} className="rs-btn rs-ghost">再提議</Link> : undefined} />
    </li>
  );


  return (
    <>
      <InboxTabs />
      {req.isPending ? <ListSkeleton rows={2} /> : req.isError ? <ErrorCard error={req.error} retry={req.refetch} /> : (<>
        {/* sub-tabs: the first two wait for Iris (amber count), the third waits for the student (quiet grey count) */}
        <div className="seg rq-seg rq-sub3" role="tablist" aria-label="申請類型">
          <button role="tab" aria-selected={tab === 'changes'} onClick={() => setTab('changes')}>改時間{changes.length > 0 && <span className="ibx-n">{changes.length}</span>}</button>
          <button role="tab" aria-selected={tab === 'reports'} onClick={() => setTab('reports')}>回報{reports.length > 0 && <span className="ibx-n">{reports.length}</span>}</button>
          <button role="tab" aria-selected={tab === 'apps'} onClick={() => setTab('apps')}>新學生{apps.length > 0 && <span className="ibx-n">{apps.length}</span>}</button>
          <button role="tab" aria-selected={tab === 'waiting'} onClick={() => setTab('waiting')}>等學生回覆{waiting.length > 0 && <span className="ibx-n" aria-label={`${waiting.length} 件等學生回覆`}>{waiting.length}</span>}</button>
        </div>
        <section className="rq-sec" role="tabpanel" aria-label={{ changes: '改時間', reports: '回報', apps: '新學生', waiting: '等待學生回覆' }[tab]}>
          {tab === 'changes' && (changeItems.length ? changeCards
            : <InboxEmpty title="沒有待處理的改時間申請" text="學生申請改時間時，會出現在這裡。" />)}
          {tab === 'reports' && (reports.length ? reportCards
            : <InboxEmpty title="沒有待審核的回報" text="學生回報沒上到的課時，會在這裡等你確認。" />)}
          {tab === 'apps' && (apps.length ? appCards
            : <InboxEmpty title="沒有新的學生申請" text="有人註冊帳號後，會在這裡等你確認。" />)}
          {tab === 'waiting' && <div className="rq-props">
            {waiting.length ? <ul className="rs-list">{waiting.map(propRow)}</ul>
              : <InboxEmpty title="目前沒有等待學生回覆的提議" text="你提議新時間後，會在這裡等學生回覆。" />}
            {answered.length > 0 && (
              <details className="rq-recent">
                <summary>最近 7 天的回覆 · {answered.length}</summary>
                <ul className="rs-list">{answered.map(propRow)}</ul>
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
      <SlotCompare from={{ date: c.fromDate, time: c.fromTime }} fromLabel="原定時段" fromHint="婉拒後維持這個時段"
        to={{ date: c.toDate, time: c.toTime }} toLabel="希望改至" tone={c.slotFree ? 'ok' : 'bad'} toHint={c.slotFree ? undefined : '此時段已有其他預約'} />
      <div className="field"><label htmlFor="dm">給學生的訊息（選填）</label><textarea id="dm" className="input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="例如：那天的 16:30 可以嗎？" /></div>
      <button className="btn danger block" disabled={ch.mutation.isPending}
        onClick={() => {
          if (recentDecisions.has(c.id)) return; // double tap: one decision only
          const n = c.studentName;
          recentDecisions.set(c.id, { c, status: 'declined' }); // the card stays in the list as 已婉拒
          // mutateAsync (not mutate + callbacks): this sheet unmounts right away, the promise still settles
          ch.mutation.mutateAsync({ id: c.id, approve: false, message: msg }).then(
            () => toast({ text: `已婉拒，10 秒後通知${n}`, undo: () => ch.undo(c.id).then(() => recentDecisions.set(c.id, null), (e) => toast({ text: (e as Error).message, kind: 'error' })) }),
            (e) => { recentDecisions.set(c.id, null); toast({ text: (e as Error).message, kind: 'error' }); });
          nav('/teacher/requests', { replace: true });
        }}>婉拒並通知學生</button>
      {/* Iris may say no and offer her own time instead — the lesson moves only if the student accepts */}
      <Link to={`/teacher/students/${c.studentId}/propose/${c.lessonId}`} replace className="btn secondary block"><Icon name="reschedule" size={18} />婉拒並提議其他時間</Link>
      <button className="btn secondary block" onClick={() => nav(-1)}>返回</button>
    </RouteSheet>
  );
}

/** 婉拒 a 回報: the reason is required (the student sees it), the lesson stays 已上課 and no credit changes. */
export function ReportDeclineSheet() {
  const { id } = useParams();
  const req = useRequests();
  const rep = useDecideReport();
  const toast = useToast();
  const nav = useNavigate();
  const [msg, setMsg] = useState('');
  const [key] = useState(newIdempotencyKey);
  const x = req.data?.reports.find((r) => r.id === id);
  if (!x) return null;
  return (
    <RouteSheet title={`婉拒${x.studentName}的回報`} dismissible={!rep.mutation.isPending}>
      <div className="inner stack g1"><p className="caption">課程（維持已上課，不退堂數）</p><p className="t">{fmtSlot(x.date, x.time)}</p>{x.reason && <p className="caption"><span className="cm-label">學生</span>：「{x.reason}」</p>}</div>
      <div className="field"><label htmlFor="rpm">婉拒原因（學生會看到）</label><textarea id="rpm" className="input" required value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="例如：那天你有來上課喔，有問題再跟我說。" /></div>
      <button className="btn danger block" disabled={!msg.trim() || rep.mutation.isPending}
        onClick={() => { const n = x.studentName; rep.mutation.mutate({ id: x.id, approve: false, message: msg, key }); nav('/teacher/requests?tab=reports', { replace: true }); toast({ text: `已婉拒，10 秒後通知${n}`, undo: () => rep.undo(x.id) }); }}>婉拒並通知學生</button>
      <button className="btn secondary block" onClick={() => nav(-1)}>返回</button>
    </RouteSheet>
  );
}

/* =================== Payments =================== */
export function PaymentsPage() {
  const [st, setSt] = useState<PaymentStatus>('Pending');
  const pays = usePayments(st);
  return (
    <>
      <InboxTabs />
      <div className="seg rq-seg" role="tablist" aria-label="收據狀態">
        {(['Pending', 'Confirmed', 'Rejected'] as const).map((s) => <button key={s} role="tab" aria-selected={st === s} onClick={() => setSt(s)}>{{ Pending: '待審核', Confirmed: '已確認', Rejected: '需補件' }[s]}</button>)}
      </div>
      {pays.isPending ? <ListSkeleton rows={2} /> : pays.isError ? <ErrorCard error={pays.error} retry={pays.refetch} /> : (
        pays.data!.length === 0 ? <InboxEmpty {...{
          Pending: { title: '沒有等待確認的收據', text: '學生上傳匯款證明後，會出現在這裡。' },
          Confirmed: { title: '還沒有已確認的收據', text: '確認過的收據會留在這裡，方便之後查帳。' },
          Rejected: { title: '沒有退回的收據', text: '退回的收據和原因會出現在這裡。' },
        }[st]} /> : <div className="pc-list">{pays.data!.map((p) => <PaymentRow key={p.id} p={p} />)}</div>
      )}
      <Outlet />
    </>
  );
}

/** 收據審核 status badge — text + icon, never colour alone. 已婉拒 has no backend status yet (see PRD Q). */
const RECEIPT_STATUS: Record<PaymentStatus, { text: string; icon: string; tone: string }> = {
  Pending: { text: '待審核', icon: 'clock', tone: 'pending' },
  Confirmed: { text: '已確認', icon: 'check', tone: 'ok' },
  Rejected: { text: '需補件', icon: 'warning', tone: 'resubmit' },
};

/**
 * B — Financial Highlight V2. 購買課堂 and 付款金額 sit in two highlighted panels so the numbers Iris must check
 * against her bank are the loudest thing on the card. 審核收據 opens the receipt; credits are only added from
 * inside it, after the amount check is ticked.
 */
function PaymentRow({ p }: { p: Payment }) {
  const { mutation, undo } = useDecidePayment();
  const toast = useToast();
  const [key] = useState(newIdempotencyKey); // one key per receipt: a retried or doubled confirm runs once (#19)
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pending = p.status === 'Pending';
  const st = RECEIPT_STATUS[p.status];
  const fees = p.fees?.reduce((n, f) => n + f.amount, 0) ?? 0;
  // mutateAsync, not mutate(…, {onSuccess}): the row leaves 待審核 straight away (optimistic), and mutate()'s
  // per-call callbacks are dropped once the component unmounts — the promise still resolves.
  const [sent, setSent] = useState(false); // second guard next to the idempotency key: the button can't fire twice
  const confirm = () => {
    if (sent) return;
    setSent(true); setErr(null);
    return mutation.mutateAsync({ id: p.id, confirm: true, key })
      .then(() => { setShow(false); toast({ text: `已確認收據，${p.studentName} +${p.packageSize} 堂`, undo: () => undo(p.id) }); })
      .catch((e) => { setSent(false); setErr((e as Error).message); }); // shown inside the receipt, next to the button
  };
  const tid = `pay-${p.id}`;
  return (
    <article className={`pc is-${st.tone}`} aria-labelledby={tid}>
      <header className="pc-head">
        <button className="pc-thumb" aria-label={`查看 ${p.studentName} 的收據`} aria-haspopup="dialog" onClick={() => setShow(true)}>
          <Icon name="receipt" size={24} /></button>
        <div className="pc-who">
          <h2 className="pc-name" id={tid}>{p.studentName}</h2>
          <p className="pc-time"><time dateTime={p.uploadedAt}>{fmtStampMin(p.uploadedAt)}</time> 上傳</p>
        </div>
        <p className="pc-badge"><Icon name={st.icon} size={16} /><span className="sr-only">狀態：</span>{st.text}</p>
      </header>

      <dl className="pc-fin">
        <div className="pc-panel"><dt>購買課堂</dt><dd>{p.trial ? '單堂課' : <>{p.packageSize}<span className="pc-unit"> 堂</span></>}</dd></div>
        <div className="pc-panel"><dt>付款金額</dt><dd><span className="pc-cur">NT$ </span>{p.amount.toLocaleString('en-US')}</dd>
          {fees > 0 && <p className="pc-fee">含取消費 {fmtMoney(fees)}</p>}</div>
      </dl>

      {p.note && <p className="pc-note"><span className="pc-note-ic" aria-hidden="true"><Icon name="msg" size={15} /></span><span><span className="sr-only">學生備註：</span>「{p.note}」</span></p>}
      {p.status === 'Rejected' && (
        <p className="pc-reject" role="note"><Icon name="warning" size={18} />
          <span><b className="cm-label">退回原因</b><b>：</b>{p.rejectReason || '未填寫'}<br /><span className="pc-reject-s">等待學生重新上傳收據</span></span></p>
      )}

      <footer className="pc-foot">
        {pending ? <>
          <Link to={`${p.id}/reject`} className="pc-btn pc-return">退回</Link>
          <button className="pc-btn pc-review" aria-haspopup="dialog" onClick={() => setShow(true)}>審核收據<Icon name="arrow" size={18} /></button>
        </> : <button className="pc-btn pc-ghost" aria-haspopup="dialog" onClick={() => setShow(true)}>查看收據</button>}
      </footer>
      {show && <ReceiptModal p={p} onClose={() => { setShow(false); setErr(null); }} onConfirm={pending ? confirm : undefined} busy={sent || mutation.isPending} error={err} />}
    </article>
  );
}

/**
 * Receipt viewer: a centred modal over a dimmed page, so the screenshot gets the whole screen's attention.
 * Native <dialog>.showModal() gives us the hard parts for free: focus moves in and is trapped, Esc closes,
 * the page behind is inert for screen readers. Tap the dark area to close; decide right from here.
 */
function ReceiptModal({ p, onClose, onConfirm, busy, error }: { p: Payment; onClose: () => void; onConfirm?: () => void; busy: boolean; error?: string | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Iris ticks that she checked amount + transfer details before credits are added (no accidental confirm)
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    openModal(d); // remembers the button, so it shrinks back into it
    const y = window.scrollY; document.documentElement.classList.add('modal-open'); // stop the page scrolling behind
    return () => { document.documentElement.classList.remove('modal-open'); window.scrollTo(0, y); };
  }, []);
  const close = () => closeModal(ref.current);
  return (
    <dialog ref={ref} className="rcpt" aria-labelledby={`rcpt-t-${p.id}`} onClose={onClose}
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="rcpt-box">
        <header className="rcpt-head">
          <div>
            <h2 id={`rcpt-t-${p.id}`}>{p.studentName} 的收據</h2>
            <p>{p.packageSize} 堂 · {fmtMoney(p.amount)} · {fmtStampMin(p.uploadedAt)} 上傳</p>
            {!!p.fees?.length && <p className="rcpt-fees">= 方案 {fmtMoney(p.amount - p.fees.reduce((n, f) => n + f.amount, 0))} + 取消費 {p.fees.map((f) => `${fmtMoney(f.amount)}（${fmtSlot(f.date, f.time)}）`).join('、')}</p>}
          </div>
          <button className="rcpt-x" aria-label="關閉" onClick={close}><Icon name="x" size={20} /></button>
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
            <button className={`rq-btn rq-approve pc-confirm${busy ? ' is-busy' : ''}`} disabled={!checked || busy} aria-busy={busy || undefined}
              aria-describedby={error ? `rcpt-err-${p.id}` : checked ? undefined : `rcpt-hint-${p.id}`} onClick={onConfirm}>
              {busy && <span className="pc-spin" aria-hidden="true" />}{busy ? '確認中…' : `確認，加 ${p.packageSize} 堂`}</button>
          </div>
          {error && <p className="rcpt-err" id={`rcpt-err-${p.id}`} role="alert"><Icon name="warning" size={18} />確認失敗：{error}</p>}
          {!checked && !error && <p className="rcpt-hint" id={`rcpt-hint-${p.id}`}>請先勾選核對，再加堂數給{p.studentName}。</p>}
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

/* =================== 編輯 聲部 / 程度 (teacher sets them) =================== */
const VOICE_TYPES = ['女高音', '女中音', '女低音', '男高音', '男中音', '男低音'];
const GRADES = Array.from({ length: 8 }, (_, i) => `Grade ${i + 1}`);
export function EditBasicsSheet() {
  const { id } = useParams();
  const s = useStudent(id!);
  const save = useSaveStudentBasics(id!);
  const flow = useSaveFlow();
  const toast = useToast();
  const nav = useNavigate();
  const [voice, setVoice] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  if (!s.data) return null;
  const d = s.data;
  const v = voice ?? d.voiceType ?? '', g = grade ?? d.grade ?? '';
  const dirty = v !== (d.voiceType ?? '') || g !== (d.grade ?? '');
  return (
    <RouteSheet title={`編輯基本資料 · ${d.name}`} dismissible={!flow.busy}>
      <div className="field"><label htmlFor="eb-voice">聲部</label>
        <select id="eb-voice" className="input" value={v} onChange={(e) => setVoice(e.target.value)}>
          <option value="">還不確定</option>{VOICE_TYPES.map((x) => <option key={x}>{x}</option>)}
        </select></div>
      <div className="field"><label htmlFor="eb-grade">程度</label>
        <select id="eb-grade" className="input" value={g} onChange={(e) => setGrade(e.target.value)}>
          <option value="">未設定</option>{GRADES.map((x) => <option key={x}>{x}</option>)}
        </select>
        <p className="tp-hint">學生在「我的」頁面會看到程度，但不能自己修改。</p></div>
      <SaveButton state={flow.state} type="button" disabled={!dirty}
        onClick={() => flow.run(() => save.mutateAsync({ voiceType: v || null, grade: g || null }), () => { nav(-1); toast({ text: `${d.name} 的基本資料已更新` }); })
          .catch((e) => toast({ text: (e as Error).message, kind: 'error' }))} />
      <button className="btn secondary block" disabled={flow.busy} onClick={() => nav(-1)}>取消</button>
    </RouteSheet>
  );
}
