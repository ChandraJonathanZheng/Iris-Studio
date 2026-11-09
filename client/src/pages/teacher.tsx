import { useCurrentUser } from '../components/Shell';
import { TEACHER_STATUS_LABEL, TeacherStatusCard } from '../components/TeacherStatus';
import { useStudio, useLogout, usePrivacyRequests, useMarkPrivacyDone, useTeacherProfile, useSaveTeacherProfile, useTeacherAvatar, useTeacherAccount, useResendVerification, useScheduleConsult, useResendConsultConfirmation } from '../lib/queries';
import { EmailSettings } from '../components/EmailSettings';
import type { TeacherProfile, TeacherPublic, TeacherStatus, PrivacyRequestType } from '../lib/types';
import { initialOf } from '../lib/date';
import { InboxTabs } from './teacher-inbox';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, Outlet, useNavigate, useParams } from 'react-router';
import {
  compareSlot, CONSULT_TIME_LABEL, dayNum, fmtDate, fmtDuration, fmtMoney, fmtRelative, fmtSlot, LESSON_TYPE_LABEL, monthGrid, monthNum, studioNowTime, studioToday,
} from '../lib/date';
import { monthRange } from '../lib/prefetch';
import { useConsults, useLessons, useMarkContacted, useOverview, useTeacherCancel } from '../lib/queries';
import type { Consult, Lesson, StudentSummary } from '../lib/types';
import { ApiError } from '../lib/api';

const errText = (e: unknown) => (e instanceof ApiError ? e.message : '發生錯誤，請稍後再試。');
import { Icon, type IconName } from '../components/Icon';
import { RouteSheet, useSheetClose } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Avatar, Empty, ErrorCard, ListSkeleton, PageHead, PageSkeleton, Tag } from '../components/ui';

export * from './teacher-students';
export * from './teacher-inbox';

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: 'numeric', hour12: false }).format(new Date()));
  return h < 11 ? '早安' : h < 18 ? '午安' : '晚安';
};
const endOf = (l: Lesson) => { const [h, m] = l.time.split(':').map(Number); const t = h * 60 + m + l.minutes; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

function Kpi({ to, title, n, detail }: { to: string; title: string; n: number; detail: string }) {
  return (
    <Link to={to} className="kpi" viewTransition>
      <span className="row between"><span className="sub">{title}</span><Icon name="chev" size={18} /></span>
      <span className="row"><span className="n">{n}</span>{n > 0 ? <Tag tone="warn">待處理</Tag> : <Tag tone="grey">沒有</Tag>}</span>
      <span className="cap">{detail}</span>
    </Link>
  );
}

function LessonLine({ l, hi }: { l: Lesson; hi?: boolean }) {
  const done = l.status === 'Attended';
  return (
    <Link to={`/teacher/students/${l.studentId}`} className={`li${hi ? ' hi' : ''}${done ? ' muted-row' : ''}`}>
      <span className="timecol">{l.time}</span>
      <div className="grow"><div className="name" style={{ fontSize: 16 }}>{l.studentName}</div><div className="cap">{fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]} · {l.room}</div></div>
      {done ? <Tag tone="grey">已上課</Tag> : l.change ? <Tag tone="warn">改時間中</Tag> : hi ? <Tag tone="accent">下一堂</Tag> : <Tag tone="ok">已確認</Tag>}
    </Link>
  );
}

function OutRow({ s }: { s: StudentSummary }) {
  return (
    <Link to={s.paymentPending ? '/teacher/payments' : `/teacher/students/${s.id}`} className="li">
      <Avatar name={s.name} id={s.id} size={36} />
      <div className="grow"><div className="name" style={{ fontSize: 16 }}>{s.name}</div><div className="cap">剩餘 {s.credits} 堂</div></div>
      {s.paymentPending ? <span className="pill warn">收據待確認 →</span> : <Tag tone="bad">用完</Tag>}
    </Link>
  );
}

export function TeacherHome() {
  const ov = useOverview();
  const now = studioNowTime();
  const { upcoming, finished } = useMemo(() => {
    const today = (ov.data?.today ?? []).filter((l) => l.status !== 'Cancelled').sort(compareSlot);
    return { upcoming: today.filter((l) => l.status === 'Booked' && endOf(l) > now), finished: today.filter((l) => !(l.status === 'Booked' && endOf(l) > now)) };
  }, [ov.data, now]);
  const c = ov.data?.counts;

  return (
    <div className="page wide">
      <PageHead title={`${greeting()}，Iris`} over={fmtDate(studioToday())} />
      {ov.isPending ? <PageSkeleton blocks={[220, 150, 150]} /> : ov.isError ? <ErrorCard error={ov.error} retry={() => ov.refetch()} /> : (
        <>
          <section className="stack s2" aria-label="今天的課"><h2 className="sec">今天的課</h2>
            {upcoming.length + finished.length === 0 ? <Empty text="今天沒有課。" /> : (
              <div className="list">
                {upcoming.map((l, i) => <LessonLine key={l.id} l={l} hi={i === 0} />)}
                {finished.length > 0 && <div className="li cap" style={{ minHeight: 36 }}>已結束</div>}
                {finished.map((l) => <LessonLine key={l.id} l={l} />)}
              </div>
            )}
          </section>
          <div className="grid2">
            <Kpi to="/teacher/payments" title="待確認收據" n={c!.receipts} detail={c!.receipts ? fmtMoney(c!.receiptsAmount) : '全部確認完了'} />
            <Kpi to="/teacher/requests" title="改時間申請" n={c!.changes} detail="學生想換時間" />
            <Kpi to="/teacher/requests" title="新學生" n={c!.applications} detail="等你確認" />
            <Kpi to="/teacher/consults" title="免費諮詢" n={c!.consults} detail="網站送來的" />
          </div>
          <section className="stack s2" aria-label="堂數用完"><h2 className="sec">堂數用完</h2>
            {ov.data.outOfQuota.length ? <div className="list">{ov.data.outOfQuota.map((s) => <OutRow key={s.id} s={s} />)}</div> : <Empty text="目前每位學生都有堂數。" />}
          </section>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- 行事曆 */
export function TeacherCalendar() {
  const [from, to] = monthRange();
  const lessons = useLessons('teacher', from, to);
  const today = studioToday();
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const [sel, setSel] = useState(today);
  const live = (lessons.data ?? []).filter((l) => l.status !== 'Cancelled');
  const on = (d: string) => live.filter((l) => l.date === d).sort(compareSlot);
  const step = (n: number) => setYm(({ y, m }) => { const t = new Date(Date.UTC(y, m - 1 + n, 1)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 }; });

  return (
    <div className="page wide">
      <PageHead title="行事曆" right={<Link className="btn secondary sm" to="/teacher/availability"><Icon name="clock" size={18} />可預約時段</Link>} />
      {lessons.isPending ? <PageSkeleton blocks={[300, 160]} /> : lessons.isError ? <ErrorCard error={lessons.error} retry={() => lessons.refetch()} /> : (
        <>
          <div className="card">
            <div className="row between"><button className="iconbtn" aria-label="上個月" onClick={() => step(-1)}><Icon name="back" /></button><h2 className="sec">{ym.y} 年 {ym.m} 月</h2><button className="iconbtn" aria-label="下個月" onClick={() => step(1)}><Icon name="chev" /></button></div>
            <div className="cal compact">
              {['一', '二', '三', '四', '五', '六', '日'].map((w) => <div key={w} className="wd">{w}</div>)}
              {monthGrid(ym.y, ym.m).map((d) => {
                const n = on(d).length;
                return (
                  <button key={d} className={`${monthNum(d) !== ym.m ? 'out' : ''} ${d === today ? 'today' : ''}`} aria-pressed={d === sel} onClick={() => setSel(d)} aria-label={`${monthNum(d)} 月 ${dayNum(d)} 日${n ? `，${n} 堂課` : ''}`}>
                    {dayNum(d)}<span className="marks mk-up" aria-hidden>{'●'.repeat(Math.min(n, 3))}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <section className="stack s2"><h2 className="sec">{fmtDate(sel)}</h2>
            {on(sel).length === 0 ? <Empty text="這天沒有課。" /> : (
              <div className="list">{on(sel).map((l) => (
                <div key={l.id} className="li">
                  <span className="timecol">{l.time}</span>
                  <div className="grow"><Link to={`/teacher/students/${l.studentId}`} className="name" style={{ fontSize: 16, color: 'var(--ink)' }}>{l.studentName}</Link>
                    <div className="cap">{LESSON_TYPE_LABEL[l.type]} · {fmtDuration(l.minutes)}</div></div>
                  {l.status === 'Attended' ? <Tag tone="grey">已上課</Tag> : l.change ? <Tag tone="warn">改時間中</Tag> : <Tag tone="accent">已預約</Tag>}
                  {l.status === 'Booked' && (
                    <>
                      <Link className="btn secondary sm" to={`/teacher/students/${l.studentId}/propose/${l.id}`}>改時間 →</Link>
                      <Link className="btn dtext" to={`lessons/${l.id}/cancel`}>取消</Link>
                    </>
                  )}
                </div>
              ))}</div>
            )}
          </section>
        </>
      )}
      <Outlet />
    </div>
  );
}

export function TeacherCancelSheet() {
  const { id } = useParams();
  const [from, to] = monthRange();
  const lessons = useLessons('teacher', from, to);
  const { cancel, undo } = useTeacherCancel();
  const toast = useToast();
  const close = useSheetClose('/teacher/calendar');
  const l = lessons.data?.find((x) => x.id === id);
  return (
    <RouteSheet title="取消這堂課" parent="/teacher/calendar">
      {!l ? <p className="sub">找不到這堂課。</p> : (
        <>
          <p><b>{l.studentName}</b>　{fmtSlot(l.date, l.time)}</p>
          <div className="info">堂數會退回給學生，10 秒後才通知學生——這段時間內可以按「復原」，學生不會看到。</div>
          {cancel.isError && <p className="err" role="alert">取消失敗，請再試一次。</p>}
          <button className="btn danger block" disabled={cancel.isPending} onClick={() => cancel.mutate(l.id, { onSuccess: () => { close(); toast({ text: `已取消 ${l.studentName} 的課`, undo: async () => { await undo(l.id); } }); } })}>取消這堂課</button>
          <button className="btn secondary block" onClick={close}>先不要</button>
        </>
      )}
    </RouteSheet>
  );
}

/* ---------------------------------------------------------------- 諮詢 */
/** 安排諮詢時間: saves the slot; an applicant who left an email gets the 諮詢時間確認 email. */
function ScheduleConsultForm({ c, close }: { c: Consult; close: () => void }) {
  const schedule = useScheduleConsult();
  const toast = useToast();
  const [f, setF] = useState({ date: c.scheduledDate ?? '', time: c.scheduledTime ?? '', note: c.scheduleNote ?? '' });
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(f.date) && /^\d{2}:\d{2}$/.test(f.time);
  const changed = f.date !== c.scheduledDate || f.time !== c.scheduledTime || f.note.trim() !== (c.scheduleNote ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault(); if (!ok) return;
    schedule.mutate({ id: c.id, ...f, note: f.note.trim() }, {
      onSuccess: () => { close(); toast({ text: !changed ? '已儲存，諮詢安排沒有變更' : c.contactType === 'email' ? `已安排，確認信會寄到 ${c.contact}` : '已安排，請透過 LINE 告知對方' }); },
      onError: (er) => toast({ text: errText(er), kind: 'error' }),
    });
  };
  return (
    <form className="stack s2" onSubmit={submit}>
      <div className="row" style={{ gap: 8 }}>
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cs-d-${c.id}`}>日期</label>
          <input id={`cs-d-${c.id}`} className="input" type="date" required min={studioToday()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor={`cs-t-${c.id}`}>時間（台北）</label>
          <input id={`cs-t-${c.id}`} className="input" type="time" required step={900} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor={`cs-n-${c.id}`}>備註（選填）</label>
        <input id={`cs-n-${c.id}`} className="input" maxLength={200} aria-describedby={`cs-h-${c.id}`} placeholder="例如：https://meet.google.com/abc-defg-hij" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      <p id={`cs-h-${c.id}`} className="caption">{c.contactType === 'email' ? `新增或更改時間、備註後，會寄出「諮詢時間確認」到 ${c.contact}。填入 Google Meet 連結後，確認信會附上加入視訊按鈕。` : '對方留的是 LINE，系統不會自動通知，請自行傳訊息。'}</p>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn secondary sm" onClick={close}>取消</button>
        <button className="btn primary sm" disabled={!ok || schedule.isPending}>{schedule.isPending ? '儲存中…' : '儲存'}</button>
      </div>
    </form>
  );
}

export function ConsultsPage() {
  const consults = useConsults();
  const mark = useMarkContacted();
  const resend = useResendConsultConfirmation();
  const toast = useToast();
  const [scheduling, setScheduling] = useState<string | null>(null);
  return (
    <div className="page">
      <InboxTabs />
      {consults.isPending ? <ListSkeleton /> : consults.isError ? <ErrorCard error={consults.error} retry={() => consults.refetch()} /> : !consults.data.length ? <Empty text="還沒有人留下諮詢。" /> : (
        <div className="stack">{consults.data.map((c) => (
          <article key={c.id} className="card">
            <div className="row between"><div className="name">{c.name}</div>{c.contacted ? <Tag tone="grey">已聯絡</Tag> : <Tag tone="warn">待聯絡</Tag>}</div>
            <div className="sub">{c.contactType === 'line' ? 'LINE' : 'Email'}：<b>{c.contact}</b> · 方便 {CONSULT_TIME_LABEL[c.preferredTime]} · {fmtRelative(c.createdAt)}</div>
            {c.topic && <p>「{c.topic}」</p>}
            {c.scheduledDate && c.scheduledTime && (
              <p className="sub"><Icon name="calendar" size={14} /> 諮詢時間：<b>{c.scheduledDate} {c.scheduledTime}</b>{c.scheduleNote ? ` · ${c.scheduleNote}` : ''}</p>
            )}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className={`btn ${c.contacted ? 'secondary' : 'primary'} sm`}
                onClick={() => mark.mutate({ id: c.id, contacted: !c.contacted }, { onSuccess: () => toast({ text: c.contacted ? '已改回待聯絡' : '已標為已聯絡', undo: async () => { await mark.mutateAsync({ id: c.id, contacted: c.contacted }); } }) })}>
                {c.contacted ? '改回待聯絡' : '標為已聯絡'}
              </button>
              {scheduling !== c.id && <button className="btn secondary sm" onClick={() => setScheduling(c.id)}>{c.scheduledDate ? '改諮詢時間' : '安排諮詢時間'}</button>}
              {scheduling !== c.id && c.contactType === 'email' && c.scheduledDate && c.scheduledTime && compareSlot({ date: c.scheduledDate, time: c.scheduledTime }, { date: studioToday(), time: studioNowTime() }) > 0 && (
                <button className="btn secondary sm" disabled={resend.isPending} onClick={() => resend.mutate(c.id, {
                  onSuccess: () => toast({ text: `確認信已排入寄送，將寄到 ${c.contact}` }),
                  onError: (er) => toast({ text: errText(er), kind: 'error' }),
                })}>{resend.isPending && resend.variables === c.id ? '寄送中…' : '重寄確認信'}</button>
              )}
            </div>
            {scheduling === c.id && <ScheduleConsultForm c={c} close={() => setScheduling(null)} />}
          </article>
        ))}</div>
      )}
    </div>
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
  const row = (to: string, icon: IconName, title: string, sub: string) => (
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
      <EmailSettings />
    </>
  );
}

/**
 * 登入方式: how Iris signs in. Kept apart from the public profile on purpose —
 * the contact LINE ID above is just text students see; LINE 登入 here is the account she signs in with.
 */
function AccountBindings({ p }: { p: TeacherProfile }) {
  const { changeEmail, unlinkLine } = useTeacherAccount();
  const resend = useResendVerification();
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
          {p.email && <p className={`tp-badge ${p.emailVerified ? 'ok' : 'warn'}`}>{p.emailVerified ? '● 已驗證' : '◆ 待驗證 · 請到信箱點驗證連結'}</p>}
          {p.email && !p.emailVerified && !edit && (
            <button type="button" className="btn link" disabled={resend.isPending}
              onClick={() => resend.mutateAsync().then(() => toast({ text: `驗證信已寄到 ${p.email}` })).catch(fail)}>重新寄送驗證信</button>
          )}</div>
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
