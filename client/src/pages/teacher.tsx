import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';
import {
  CLASS_TYPE_LABEL, compareSlot, dayNum, fmtDate, fmtDuration, fmtMoney, fmtRelative, fmtSlot, initialOf, LESSON_TYPE_LABEL, monthGrid, monthNum,
  studioNowTime, studioToday, wd,
} from '../lib/date';
import { monthRange } from '../lib/prefetch';
import {
  useLessons, useLogout, useMarkPrivacyDone, useOverview, usePrivacyRequests, useSaveTeacherProfile, useStudio, useTeacherAccount, useTeacherAvatar,
  useTeacherCancel, useTeacherProfile,
} from '../lib/queries';
import type { Lesson, PrivacyRequestType, StudentSummary, TeacherProfile, TeacherStatus } from '../lib/types';
import { Icon, type IconName } from '../components/Icon';
import { RouteSheet, useSheetClose } from '../components/Sheet';
import { inboxCount, useCurrentUser } from '../components/Shell';
import { statusText, TEACHER_STATUS_LABEL, TeacherStatusCard } from '../components/TeacherStatus';
import { useToast } from '../components/Toast';
import { Empty, ErrorCard, ListSkeleton, PageHead, PageSkeleton, Sk } from '../components/ui';

export * from './teacher-students';
export * from './teacher-inbox';
export * from './teacher-reels';

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: 'numeric', hour12: false }).format(new Date()));
  return h < 11 ? '早安' : h < 18 ? '午安' : '晚安';
};

/* ---------- 首頁 ---------- */

/** 今日待辦 tile: amber edge + ◆ when there is work, quiet at 0. */
function TodoTile({ to, title, icon, n, detail }: { to: string; title: string; icon: IconName; n: number; detail: string }) {
  return (
    <Link to={to} className={`kpi${n > 0 ? ' is-due' : ' is-clear'}`} viewTransition aria-label={`${title}：${n > 0 ? `${n} 件待處理` : '沒有待處理'}，${detail}`}>
      <span className="kt"><Icon name={icon} size={18} />{title}</span>
      <span className="kn"><span className="big">{n}</span>{n > 0 && <span className="kpi-due">◆ 待處理</span>}</span>
      <span className="kd">{detail}</span>
    </Link>
  );
}

export function TeacherHome() {
  const me = useCurrentUser();
  const overview = useOverview();
  const today = studioToday();
  const c = overview.data?.counts;
  const todo = inboxCount(c);
  return (
    <>
      <div className="stack g1 th-hello">
        <p className="overline">{fmtDate(today)}</p>
        <h1 className="h1">{greeting()}，{me.name}</h1>
        <p className="caption">{overview.data ? `今天 ${overview.data.today.length} 堂課 · ${todo ? `${todo} 件待處理` : '沒有待處理的事'}` : ' '}</p>
      </div>
      {overview.isPending ? (
        <>
          <div className="kpis">{[0, 1, 2, 3].map((i) => <Sk key={i} h={104} card />)}</div>
          <ListSkeleton rows={3} />
        </>
      ) : overview.isError ? <ErrorCard error={overview.error} retry={overview.refetch} /> : c && (
        <>
          <section className="th-todo" aria-labelledby="th-todo-h">
            <h2 className="overline" id="th-todo-h">今日待辦</h2>
            <div className="kpis">
              <TodoTile to={c.changes || !c.reports ? '/teacher/requests' : '/teacher/requests?tab=reports'} icon="repeat" title="學生申請" n={c.changes + c.reports}
                detail={c.changes + c.reports ? [c.changes && `改時間 ${c.changes}`, c.reports && `回報 ${c.reports}`].filter(Boolean).join(' · ') : '沒有新的申請'} />
              <TodoTile to="/teacher/payments" icon="receipt" title="待確認收據" n={c.receipts} detail={c.receipts ? `共 ${fmtMoney(c.receiptsAmount)}` : '都已確認'} />
              <TodoTile to="/teacher/requests?tab=apps" icon="user" title="新學生" n={c.applications} detail={c.applications ? '等待你確認帳號' : '沒有新的申請'} />
              <TodoTile to="/teacher/consults" icon="msg" title="諮詢" n={c.consults} detail={c.consults ? '還沒聯絡' : '都已聯絡'} />
            </div>
          </section>
          <section className="card th-today" aria-labelledby="th-today-h">
            <div className="th-head">
              <h2 className="overline" id="th-today-h">今天的課</h2>
              <Link to="/teacher/calendar" className="th-more" viewTransition>查看完整行事曆 <span aria-hidden="true">→</span></Link>
            </div>
            {overview.data.today.length ? <TodayLessons lessons={overview.data.today} /> : <p className="caption">今天沒有課。</p>}
          </section>
          <section className="card th-quota" aria-labelledby="th-quota-h">
            <div className="th-head">
              <h2 className="overline" id="th-quota-h">堂數用完</h2>
              {overview.data.outOfQuota.length > 0 && <span className="th-count">{overview.data.outOfQuota.length} 位</span>}
            </div>
            {overview.data.outOfQuota.length
              ? <ul className="th-qlist">{overview.data.outOfQuota.map((s) => <OutOfQuotaRow key={s.id} s={s} />)}</ul>
              : <p className="caption">每位學生都還有堂數。</p>}
          </section>
        </>
      )}
    </>
  );
}

/** 今天的課: 下一堂 highlighted, finished lessons muted below 已結束. */
function TodayLessons({ lessons }: { lessons: Lesson[] }) {
  const now = studioNowTime();
  const done = (l: Lesson) => l.status === 'Attended' || l.time <= now;
  const nextId = lessons.find((l) => !done(l) && !l.change)?.id ?? lessons.find((l) => !done(l))?.id;
  const open = lessons.filter((l) => !done(l));
  const finished = lessons.filter(done);
  const row = (l: Lesson) => {
    const isDone = done(l);
    const isNext = l.id === nextId;
    return (
      <li key={l.id} className={`th-lesson${isDone ? ' is-done' : ''}${isNext ? ' is-next' : ''}`} aria-current={isNext ? 'true' : undefined}>
        <span className="th-time">{l.time}</span>
        <div className="th-body"><p className="th-name">{l.studentName}</p><p className="th-meta">{fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]}</p></div>
        {isNext ? <span className="th-next">下一堂</span> : isDone ? <span className="th-state done">已上課</span>
          : l.change ? <span className="th-state warn">改時間中</span> : <span className="th-state">已預約</span>}
      </li>
    );
  };
  return (
    <>
      {open.length ? <ul className="th-list">{open.map(row)}</ul> : <p className="th-allDone">今天的課都上完了。</p>}
      {finished.length > 0 && (
        <>
          <p className="th-sub" id="th-done-h">已結束 · {finished.length} 堂</p>
          <ul className="th-list" aria-labelledby="th-done-h">{finished.map(row)}</ul>
        </>
      )}
    </>
  );
}

function OutOfQuotaRow({ s }: { s: StudentSummary }) {
  return (
    <li className="th-qrow">
      <Link to={`/teacher/students/${s.id}`} className="th-qwho" viewTransition>
        <span className="avatar th-qavatar" aria-hidden="true">{initialOf(s.name)}</span>
        <span className="th-qtext"><span className="th-qname">{s.name}</span><span className="th-qmeta">{CLASS_TYPE_LABEL[s.classType]} · 剩 0 堂</span></span>
      </Link>
      {s.paymentPending
        ? <Link to="/teacher/payments" className="th-pending" viewTransition>收據待確認 <span aria-hidden="true">→</span></Link>
        : <span className="th-used">● 用完</span>}
    </li>
  );
}

/* ---------- 行事曆 ---------- */

export function TeacherCalendar() {
  const [from, to] = monthRange();
  const lessons = useLessons('teacher', from, to);
  const today = studioToday();
  const [[year, month], setMonth] = useState<[number, number]>(() => [Number(today.slice(0, 4)), Number(today.slice(5, 7))]);
  const [picked, setPicked] = useState(today);
  const byDate = useMemo(() => {
    const m = new Map<string, Lesson[]>();
    (lessons.data ?? []).filter((l) => l.status !== 'Cancelled').forEach((l) => m.set(l.date, [...(m.get(l.date) ?? []), l]));
    return m;
  }, [lessons.data]);
  const shiftMonth = (d: number) => setMonth(([y, m]) => { const n = m + d; return n < 1 ? [y - 1, 12] : n > 12 ? [y + 1, 1] : [y, n]; });
  const day = [...(byDate.get(picked) ?? [])].sort(compareSlot);
  const now = studioNowTime();
  const finished = (l: Lesson) => l.status === 'Attended' || l.date < today || (l.date === today && l.time <= now);

  return (
    <>
      <PageHead title="行事曆" right={<Link to="/teacher/availability" className="tc-avail" viewTransition><Icon name="clock" size={18} />可預約時段</Link>} />
      {lessons.isPending ? <PageSkeleton blocks={[300]} /> : (
        <div className="split">
          <section className="card tc-cal" aria-label="月曆">
            <div className="tc-nav">
              <button className="icon-btn flat" aria-label="上個月" onClick={() => shiftMonth(-1)}><Icon name="back" /></button>
              <p className="tc-month" aria-live="polite">{year} 年 {month} 月</p>
              <button className="icon-btn flat" aria-label="下個月" onClick={() => shiftMonth(1)}><Icon name="chev" /></button>
            </div>
            <div className="cal tc-grid">
              {['一', '二', '三', '四', '五', '六', '日'].map((d) => <span className="wd" key={d}>{d}</span>)}
              {monthGrid(year, month).map((d) => {
                const n = byDate.get(d)?.length ?? 0;
                return (
                  <button key={d} className={`${d.slice(5, 7) !== String(month).padStart(2, '0') ? 'out' : ''}${d === today ? ' today' : ''}`} aria-pressed={picked === d}
                    aria-label={`${monthNum(d)}月${dayNum(d)}日 星期${wd(d)}${n ? `，${n} 堂課` : ''}`} onClick={() => setPicked(d)}>
                    <span>{dayNum(d)}</span><i className={n ? (d < today ? 'past' : 'up') : ''} />
                  </button>
                );
              })}
            </div>
          </section>
          <section className="card tc-day" aria-labelledby="tc-day-h">
            <h2 className="overline" id="tc-day-h">{picked === today ? '今天 · ' : ''}{fmtDate(picked)}{day.length ? ` · ${day.length} 堂` : ''}</h2>
            {day.length ? (
              <ul className="tc-list">
                {day.map((l) => {
                  const isDone = finished(l);
                  const actionable = l.status === 'Booked' && !isDone;
                  return (
                    <li key={l.id} className={`tc-row${isDone ? ' is-done' : ''}`}>
                      <span className="tc-time">{l.time}</span>
                      <div className="tc-body">
                        <p className="tc-name">{l.studentName}</p>
                        <p className={`tc-state${isDone ? ' done' : l.change ? ' warn' : ''}`}>
                          {isDone ? '● 已上課' : l.change ? (l.change.by === 'teacher' ? '◆ 等學生回覆' : '◆ 學生申請改時間') : '● 已預約'}
                        </p>
                      </div>
                      {actionable && !l.change && (
                        <Link to={`/teacher/students/${l.studentId}/propose/${l.id}`} className="tc-cancel tc-move" aria-label={`提議改時間：${l.studentName} ${fmtSlot(l.date, l.time)}`}>改時間</Link>
                      )}
                      {actionable && <Link to={`lessons/${l.id}/cancel`} className="tc-cancel" aria-label={`取消 ${l.studentName} ${fmtSlot(l.date, l.time)} 的課`}>取消</Link>}
                    </li>
                  );
                })}
              </ul>
            ) : <Empty text="這天沒有課。" />}
          </section>
        </div>
      )}
      <Outlet />
    </>
  );
}

/** Iris cancels: the credit always comes back, the student is told after 10 s (undo stops it). */
export function TeacherCancelSheet() {
  const { id } = useParams();
  const [from, to] = monthRange();
  const lessons = useLessons('teacher', from, to);
  const { cancel, undo } = useTeacherCancel();
  const toast = useToast();
  const close = useSheetClose("/teacher/calendar");
  const l = lessons.data?.find((x) => x.id === id);
  if (!l) return null;
  return (
    <RouteSheet title="取消這堂課？" parent="/teacher/calendar" dismissible={!cancel.isPending}>
      <div className="inner tc-sheet-sum">
        <p className="tc-sheet-when">{fmtSlot(l.date, l.time)}</p>
        <p className="tc-sheet-who">{l.studentName} · {fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]}</p>
      </div>
      <ul className="tc-policy">
        <li><b>堂數會退回。</b>老師取消的課，{l.studentName}的 1 堂會自動加回帳號。</li>
        <li><b>10 秒後通知學生。</b>按下取消後有 10 秒可以復原，復原的話學生不會收到通知。</li>
      </ul>
      <button className="btn danger block" disabled={cancel.isPending} onClick={() => {
        const name = l.studentName, when = fmtSlot(l.date, l.time);
        cancel.mutateAsync(l.id)
          .then(() => toast({ text: `已取消 ${name} ${when}，堂數已退回`, undo: async () => { await undo(l.id); } }))
          .catch((e: Error) => toast({ text: e.message, kind: 'error' }));
        close();
      }}>取消這堂課</button>
      <button className="btn secondary block" onClick={() => close()}>保留這堂課</button>
    </RouteSheet>
  );
}

/* ---------- 更多 ---------- */

export function TeacherMore() {
  const me = useCurrentUser();
  const studio = useStudio();
  const logout = useLogout();
  const navigate = useNavigate();
  const row = (to: string, icon: IconName, title: string, sub: string) => (
    <Link to={to} className="mo-row" viewTransition>
      <span className="mo-ic" aria-hidden="true"><Icon name={icon} size={20} /></span>
      <span className="mo-body"><span className="mo-t">{title}</span><span className="mo-s">{sub}</span></span>
      <Icon name="chev" size={18} />
    </Link>
  );
  const teacher = studio.data?.teacher;
  return (
    <>
      <PageHead title="更多" />
      <Link to="/teacher/profile" className="mo-me mo-list" viewTransition>
        <span className="avatar">{teacher?.avatarUrl ? <img src={teacher.avatarUrl} alt="" /> : initialOf(me.name)}</span>
        <span className="mo-body"><span className="mo-t">{me.name}</span><span className="mo-s">教師個人資料 · 狀態：{teacher ? statusText(teacher) : '…'}</span></span>
        <Icon name="chev" size={18} />
      </Link>
      <section className="mo-list" aria-label="工作室">
        {row('/teacher/availability', 'clock', '可預約時段', '每週時段、特殊日期')}
        {row('/teacher/more/packages', 'receipt', '課程方案', '堂數與價格')}
        {row('/teacher/availability?tab=settings', 'gear', '設定', '每堂課時長、課程間隔、可提前預約')}
        {row('/teacher/reels', 'play', '網站精彩片段', '首頁的 Instagram Reels，最多 8 支')}
      </section>
      <section className="mo-list" aria-label="隱私">
        {row('/teacher/privacy-requests', 'info', '個資權利申請', '查詢、更正、刪除、撤回同意 · 法定期限內回覆')}
        {row('/legal/privacy', 'eye', '法律與隱私文件', '服務條款、隱私權政策等（草案）')}
      </section>
      <section className="mo-list" aria-label="帳號">
        <button className="mo-row mo-out" onClick={() => { navigate('/'); logout.mutate(); }}>
          <span className="mo-ic" aria-hidden="true"><Icon name="logout" size={20} /></span>
          <span className="mo-body"><span className="mo-t">登出</span></span>
        </button>
      </section>
      <Outlet />
    </>
  );
}

export function PackagesSheet() {
  const studio = useStudio();
  const close = useSheetClose("/teacher/more");
  return (
    <RouteSheet title="課程方案" parent="/teacher/more">
      <ul className="mo-pk">
        {studio.data?.packages.map((p) => (
          <li key={p.size + String(p.trial)}>
            <span className="mo-t">{p.trial ? '單堂課 · ' : ''}{p.size} 堂</span>
            <span className="mo-s">{p.trial ? '只限體驗學生，一次' : `每堂 ${fmtMoney(Math.round(p.price / p.size))}`}</span>
            <b>{fmtMoney(p.price)}</b>
          </li>
        ))}
      </ul>
      <p className="caption">學生隨時都可以購買，確認收據後堂數會加在剩餘的堂數上，沒有使用期限。要調整方案或價格，請聯絡網站管理員。</p>
      <button className="btn secondary block" onClick={() => close()}>關閉</button>
    </RouteSheet>
  );
}

/* ---------- 個資權利申請 ---------- */

const PRIVACY_TYPE: Record<PrivacyRequestType, string> = { access: '查詢或閱覽', copy: '製給複製本', correct: '補充或更正', stop: '停止蒐集處理利用', delete: '刪除', withdraw: '撤回同意' };

export function PrivacyRequestsPage() {
  const requests = usePrivacyRequests();
  const markDone = useMarkPrivacyDone();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const now = Date.now();
  return (
    <>
      <PageHead title="個資權利申請" back />
      <p className="caption" style={{ maxWidth: 720 }}>請先確認申請人身分（例如請對方從註冊的 Email 或 LINE 回覆），再處理。延長期限時，需以書面告知原因。</p>
      {requests.isPending ? <ListSkeleton rows={2} /> : requests.isError ? <ErrorCard error={requests.error} retry={requests.refetch} /> : requests.data.length === 0 ? (
        <div className="ibx-empty">
          <span className="ibx-empty-ic" aria-hidden="true"><Icon name="check" size={18} weight="bold" /></span>
          <div><p className="ibx-empty-t">目前沒有個資權利申請</p><p className="ibx-empty-s">有人從網站「個人資料權利申請」送出後，會出現在這裡。</p></div>
        </div>
      ) : (
        <div className="rq-list">
          {requests.data.map((r) => {
            const left = Math.ceil((Date.parse(r.dueAt) - now) / 86_400_000);
            return (
              <article key={r.id} className={`rq pr-card${r.status === 'done' ? ' is-done' : ''}`} aria-labelledby={`pr-${r.id}`}>
                <header className="rq-who">
                  <div className="rq-who-text">
                    <h2 className="rq-name" id={`pr-${r.id}`}>{r.name} · {PRIVACY_TYPE[r.type]}</h2>
                    <p className="rq-sub">{r.contact} · {fmtRelative(r.createdAt)} 送出</p>
                  </div>
                </header>
                {r.detail && <p className="rq-reason">「{r.detail}」</p>}
                <div className="rq-foot">
                  {r.status === 'done' ? <p className="rq-status ok">● 已處理 · {r.note}</p> : (
                    <p className={`rq-status ${left < 0 ? 'bad' : left <= 3 ? 'wait' : ''}`}>
                      {left < 0 ? `✕ 已逾期 ${-left} 天` : `◆ ${fmtDate(r.dueAt.slice(0, 10))} 前需回覆（剩 ${left} 天）`}
                    </p>
                  )}
                  {r.status === 'open' && editing !== r.id && (
                    <div className="rq-actions"><button className="rq-btn rq-approve" onClick={() => { setEditing(r.id); setNote(''); }}>標為已處理</button></div>
                  )}
                </div>
                {editing === r.id && (
                  <form className="pr-done" onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    markDone.mutateAsync({ id: r.id, note }).then(() => { setEditing(null); toast({ text: '已記錄處理結果' }); }).catch((er: Error) => toast({ text: er.message, kind: 'error' }));
                  }}>
                    <div className="field">
                      <label htmlFor={`pn-${r.id}`}>處理結果（會保存作為紀錄）</label>
                      <textarea id={`pn-${r.id}`} className="input" required maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：已於 11/10 以 Email 提供資料複本" />
                    </div>
                    <div className="rq-actions">
                      <button type="button" className="rq-btn rq-decline" onClick={() => setEditing(null)}>取消</button>
                      <button className="rq-btn rq-approve" disabled={!note.trim() || markDone.isPending}>儲存</button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ---------- 教師個人資料 ---------- */

const STATUSES: TeacherStatus[] = ['normal', 'vacation', 'noNewStudents', 'custom'];
const STATUS_IDEAS: Record<TeacherStatus, string[]> = {
  normal: ['歡迎隨時預約', '訊息通常當天回覆'],
  vacation: ['放假中，明天回覆', '這週休息，下週一恢復上課'],
  noNewStudents: ['目前名額已滿，暫停接新學生', '舊生預約照常'],
  custom: ['準備比賽中，回覆會慢一點', '外出演出，晚上回覆'],
};

export function TeacherProfilePage() {
  const profile = useTeacherProfile();
  if (profile.isPending) return <><PageHead title="教師個人資料" back /><PageSkeleton /></>;
  if (profile.isError) return <><PageHead title="教師個人資料" back /><ErrorCard error={profile.error} retry={profile.refetch} /></>;
  return <ProfileForm p={profile.data} />;
}

function ProfileForm({ p }: { p: TeacherProfile }) {
  const save = useSaveTeacherProfile();
  const { upload, remove } = useTeacherAvatar();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const initial = { name: p.name, lineId: p.lineId ?? '', lineIdPublic: p.lineIdPublic, status: p.status, statusLabel: p.statusLabel ?? '', statusMessage: p.statusMessage ?? '' };
  const [f, setF] = useState(initial);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((x) => ({ ...x, [k]: v })); setSaved(false); };
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const labelMissing = f.status === 'custom' && !f.statusLabel.trim();
  const preview = {
    name: f.name.trim() || p.name, avatarUrl: p.avatarUrl, status: f.status, statusLabel: f.statusLabel,
    statusMessage: f.statusMessage.trim() || null, lineId: f.lineIdPublic && f.lineId.trim() ? f.lineId.trim() : null,
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || labelMissing) return;
    save.mutateAsync({ name: f.name, lineId: f.lineId || null, lineIdPublic: f.lineIdPublic, status: f.status, statusLabel: f.statusLabel || null, statusMessage: f.statusMessage || null })
      .then((r) => {
        setF({ name: r.name, lineId: r.lineId ?? '', lineIdPublic: r.lineIdPublic, status: r.status, statusLabel: r.statusLabel ?? '', statusMessage: r.statusMessage ?? '' });
        setSaved(true);
        toast({ text: '已儲存，學生現在看到的是新的資料' });
      })
      .catch((er: Error) => toast({ text: er.message, kind: 'error' }));
  };
  const pickAvatar = (img?: File) => {
    if (!img) return;
    if (img.size > 2 * 1024 * 1024) { toast({ text: '照片不能超過 2 MB。', kind: 'error' }); return; }
    upload.mutateAsync(img).then(() => toast({ text: '已更新大頭貼' })).catch((er: Error) => toast({ text: er.message, kind: 'error' }));
  };

  return (
    <>
      <PageHead title="教師個人資料" back />
      <section className="tp-sec" aria-labelledby="tp-prev-h">
        <h2 className="overline" id="tp-prev-h">學生看到的樣子</h2>
        <TeacherStatusCard t={preview} preview />
        <p className="tp-hint">{dirty ? '◆ 這是預覽，按「儲存」後學生才會看到。' : '● 這是學生現在看到的樣子。'}</p>
      </section>
      <form className="tp-form" onSubmit={submit} noValidate>
        <section className="tp-card" aria-labelledby="tp-av-h">
          <h2 className="tp-h" id="tp-av-h">大頭貼</h2>
          <div className="tp-av-row">
            <span className="tp-av" aria-hidden="true">{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initialOf(p.name)}</span>
            <div className="tp-av-act">
              <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="tp-file" tabIndex={-1} aria-label="選擇大頭貼照片"
                onChange={(e) => { pickAvatar(e.target.files?.[0]); e.target.value = ''; }} />
              <button type="button" className="btn secondary sm" disabled={upload.isPending} onClick={() => file.current?.click()}>
                {upload.isPending ? '上傳中…' : p.avatarUrl ? '更換照片' : '上傳照片'}
              </button>
              {p.avatarUrl && <button type="button" className="tp-text-btn" disabled={remove.isPending} onClick={() => remove.mutateAsync().then(() => toast({ text: '已移除大頭貼' }))}>移除</button>}
              <p className="tp-hint">JPG、PNG 或 WEBP，2 MB 以內。照片會馬上更新。</p>
            </div>
          </div>
        </section>
        <section className="tp-card" aria-labelledby="tp-basic-h">
          <h2 className="tp-h" id="tp-basic-h">基本資料</h2>
          <div className="field">
            <label htmlFor="tp-name">教師名稱</label>
            <input id="tp-name" placeholder="例如：Iris 老師" className="input" required maxLength={40} autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tp-line">LINE ID（聯絡用）</label>
            <input id="tp-line" className="input" maxLength={30} autoComplete="off" autoCapitalize="none" value={f.lineId} onChange={(e) => set('lineId', e.target.value)} placeholder="例如：iris.voice" />
          </div>
          <div className="tp-switch">
            <div>
              <p className="tp-t" id="tp-pub-l">讓學生看到我的 LINE ID</p>
              <p className="tp-hint" id="tp-pub-d">{f.lineId.trim() ? (f.lineIdPublic ? '學生的首頁會顯示這個 ID。' : '關閉時只有你自己看得到。') : '先填寫 LINE ID 才能公開。'}</p>
            </div>
            <button type="button" className="switch" role="switch" aria-checked={f.lineIdPublic && !!f.lineId.trim()} disabled={!f.lineId.trim()}
              aria-labelledby="tp-pub-l" aria-describedby="tp-pub-d" onClick={() => set('lineIdPublic', !f.lineIdPublic)} />
          </div>
        </section>
        <section className="tp-card" aria-labelledby="tp-st-h">
          <h2 className="tp-h" id="tp-st-h">目前狀態</h2>
          <div className="tp-status" role="radiogroup" aria-labelledby="tp-st-h">
            {STATUSES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={f.status === s} className="tp-st" onClick={() => set('status', s)}>
                <span aria-hidden="true">{s === 'normal' ? '●' : '◆'}</span>{TEACHER_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {f.status === 'custom' && (
            <div className="field">
              <label htmlFor="tp-label">自訂狀態名稱</label>
              <input id="tp-label" className="input" maxLength={12} value={f.statusLabel} onChange={(e) => set('statusLabel', e.target.value)} placeholder="例如：比賽準備中"
                aria-invalid={labelMissing || undefined} aria-describedby="tp-label-h" />
              <p className="tp-hint" id="tp-label-h">{labelMissing ? '請填寫 1–12 個字。' : `${f.statusLabel.length} / 12`}</p>
            </div>
          )}
          <div className="field">
            <label htmlFor="tp-msg">狀態訊息</label>
            <input id="tp-msg" className="input" maxLength={60} value={f.statusMessage} onChange={(e) => set('statusMessage', e.target.value)} placeholder="例如：放假中，明天回覆" aria-describedby="tp-msg-h" />
            <p className="tp-hint" id="tp-msg-h">{f.statusMessage.length} / 60 · 學生會在首頁看到</p>
          </div>
          <div className="tp-ideas" aria-label="訊息範例">
            {STATUS_IDEAS[f.status].map((m) => <button key={m} type="button" className="tp-idea" onClick={() => set('statusMessage', m)}>{m}</button>)}
          </div>
        </section>
        <button className="btn primary block" disabled={!dirty || labelMissing || save.isPending}>{save.isPending ? '儲存中…' : saved && !dirty ? '✓ 已儲存' : '儲存'}</button>
      </form>
      <SignInMethods p={p} />
    </>
  );
}

/** 登入方式: separate from the public profile — students never see it. */
function SignInMethods({ p }: { p: TeacherProfile }) {
  const { changeEmail, unlinkLine } = useTeacherAccount();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const fail = (e: Error) => toast({ text: e.message, kind: 'error' });
  return (
    <section className="tp-card tp-acc" aria-labelledby="tp-acc-h">
      <h2 className="tp-h" id="tp-acc-h">登入方式</h2>
      <p className="tp-hint">只用來登入，學生看不到。</p>
      <div className="tp-bind">
        <span className="mo-ic" aria-hidden="true"><Icon name="mail" size={18} /></span>
        <div className="tp-bind-b">
          <p className="tp-t">Email</p>
          <p className="tp-s">{p.email ?? '尚未設定'}</p>
          {p.email && <p className={`tp-badge ${p.emailVerified ? 'ok' : 'warn'}`}>{p.emailVerified ? '● 已驗證' : '◆ 待驗證 · 請到信箱點驗證連結'}</p>}
        </div>
        {!editing && <button className="btn secondary sm" onClick={() => { setEditing(true); setEmail(p.email ?? ''); }}>變更</button>}
      </div>
      {editing && (
        <form className="tp-email" onSubmit={(e) => {
          e.preventDefault();
          changeEmail.mutateAsync({ email, password }).then(() => { setEditing(false); setPassword(''); toast({ text: '已更新 Email，請到新信箱完成驗證' }); }).catch(fail);
        }}>
          <div className="field">
            <label htmlFor="tp-em">新的 Email</label>
            <input id="tp-em" placeholder="name@example.com" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tp-pw">目前的密碼</label>
            <input id="tp-pw" placeholder="輸入目前的密碼" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="tp-hint">為了保護帳號，變更登入 Email 需要輸入密碼。</p>
          </div>
          <div className="tp-email-act">
            <button type="button" className="btn secondary" onClick={() => { setEditing(false); setPassword(''); }}>取消</button>
            <button className="btn primary" disabled={changeEmail.isPending || !email || !password}>{changeEmail.isPending ? '更新中…' : '更新 Email'}</button>
          </div>
        </form>
      )}
      <div className="tp-bind">
        <span className="mo-ic" aria-hidden="true"><span className="li-mark"><Icon name="msg" size={14} /></span></span>
        <div className="tp-bind-b">
          <p className="tp-t">LINE 登入</p>
          <p className={`tp-badge ${p.lineLinked ? 'ok' : 'off'}`}>{p.lineLinked ? '● 已綁定' : '○ 尚未綁定'}</p>
          {!p.lineLinked && <p className="tp-hint">綁定後可以用 LINE 一鍵登入。LINE Login 設定完成後開放。</p>}
        </div>
        {p.lineLinked
          ? <button className="btn secondary sm" disabled={unlinkLine.isPending || !p.hasPassword} onClick={() => unlinkLine.mutateAsync().then(() => toast({ text: '已解除 LINE 綁定' })).catch(fail)}>解除</button>
          : <button className="btn secondary sm" disabled aria-describedby="tp-acc-h">綁定</button>}
      </div>
    </section>
  );
}
