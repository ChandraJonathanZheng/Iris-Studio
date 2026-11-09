import { TeacherStatusCard } from '../components/TeacherStatus';
import { CONSENT_TEXT, CONSENT_VERSION } from '../lib/legal';
import { useMyConsents, useSaveConsents } from '../lib/queries';
import { useMemo, useRef, useState } from 'react';
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError, newIdempotencyKey } from '../lib/api';
import {
  CLASS_TYPE_LABEL, compareSlot, dayNum, fmtDate, fmtDuration, fmtMoney, fmtRelative, fmtSlot, LESSON_TYPE_LABEL, monthGrid, monthNum,
  studioNowTime, studioToday,
} from '../lib/date';
import { monthRange } from '../lib/prefetch';
import {
  useAlerts, useAnswerProposal, useAskMove, useBook, useCancelLesson, useLessons, useMarkAllRead, useMyPayments, useStudio, useUpdateProfile,
  useLogout, useUploadReceipt, useWithdrawMove,
} from '../lib/queries';
import type { Lesson, Payment } from '../lib/types';
import { useCurrentUser } from '../components/Shell';
import { Icon } from '../components/Icon';
import { RouteSheet, useSheetClose } from '../components/Sheet';
import { SlotPicker, type Picked } from '../components/SlotPicker';
import { useToast } from '../components/Toast';
import { EmailSettings } from '../components/EmailSettings';
import { DateBox, Empty, ErrorCard, ListSkeleton, PageHead, PageSkeleton, Quota, Segmented, Tag } from '../components/ui';

const MOVE_HOURS_FALLBACK = 12;
const errText = (e: unknown, fallback = '發生錯誤，請稍後再試。') => (e instanceof ApiError ? e.message : fallback);

/** Studio time is UTC+8 all year (Taiwan has no daylight saving). */
const hoursUntil = (l: { date: string; time: string }) => (new Date(`${l.date}T${l.time}:00+08:00`).getTime() - Date.now()) / 3_600_000;
const isUpcoming = (l: Lesson) => l.status === 'Booked' && compareSlot(l, { date: studioToday(), time: studioNowTime() }) >= 0;

function useMyLessons() {
  const [from, to] = monthRange();
  return useLessons('student', from, to);
}
const dayWord = (date: string) => {
  const n = Math.round((Date.parse(date) - Date.parse(studioToday())) / 86_400_000);
  return n <= 0 ? '今天上課' : n === 1 ? '明天上課' : `${n} 天後上課`;
};

/* ---------------------------------------------------------------- 首頁 */
function LessonStatus({ l }: { l: Lesson }) {
  if (l.change?.by === 'student') return <Tag tone="warn">等待老師回覆</Tag>;
  return <Tag tone="ok">已確認</Tag>;
}

function ProposalCard({ l }: { l: Lesson }) {
  const answer = useAnswerProposal();
  const toast = useToast();
  const c = l.change!;
  const reply = (accept: boolean) => answer.mutate({ id: c.id, accept }, {
    onSuccess: () => toast({ text: accept ? `已改到 ${fmtSlot(c.toDate, c.toTime)}` : '已保留原本的時間' }),
    onError: (e) => toast({ text: errText(e, '這個時段剛被預約了，請稍後與 Iris 聯絡。'), kind: 'error' }),
  });
  return (
    <section className="card proposal" aria-label="老師的提議">
      <div className="over" style={{ color: 'var(--warn)' }}><Icon name="repeat" size={14} /> 老師想調整上課時間</div>
      <div><span className="strike">{fmtSlot(l.date, l.time)}</span> <Icon name="arrow" size={14} /> <b className="hero-num" style={{ fontSize: 18 }}>{fmtSlot(c.toDate, c.toTime)}</b></div>
      {c.reason && <p>老師：「{c.reason}」</p>}
      <p className="cap">按「可以」後，這堂課才會改到新時間；不方便就維持原本時間。</p>
      <div className="row">
        <button className="btn secondary grow" disabled={answer.isPending} onClick={() => reply(false)}>不方便</button>
        <button className="btn primary wide" disabled={answer.isPending} onClick={() => reply(true)}>可以，改到這個時間</button>
      </div>
    </section>
  );
}

function NextLesson({ l, moveHours }: { l: Lesson; moveHours: number }) {
  const withdraw = useWithdrawMove();
  const toast = useToast();
  const tooLate = hoursUntil(l) < moveHours;
  const pending = l.change?.by === 'student' ? l.change : null;
  return (
    <section className="card hero" aria-label="下一堂課">
      <div className="over">{dayWord(l.date)}</div>
      <div className="row top">
        <DateBox date={l.date} />
        <div className="grow stack s2" style={{ gap: 2 }}>
          <div className="hero-num">{fmtDate(l.date)} {l.time}</div>
          <div className="sub">{fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]} · {l.room}</div>
          <LessonStatus l={l} />
        </div>
      </div>
      {pending && <div className="info">已申請改到 <b>{fmtSlot(pending.toDate, pending.toTime)}</b>，原時段保留到 Iris 回覆。</div>}
      <div className="row">
        {pending
          ? <button className="btn secondary grow" disabled={withdraw.isPending} onClick={() => withdraw.mutate(pending.id, { onSuccess: () => toast({ text: '已撤回改時間申請' }) })}>撤回申請</button>
          : <Link className="btn secondary grow" to={`/app/lessons/${l.id}/move`} aria-disabled={tooLate} onClick={(e) => tooLate && e.preventDefault()}>改時間</Link>}
        <Link className="btn dtext" to={`/app/lessons/${l.id}/cancel`}>取消預約</Link>
      </div>
      {tooLate && !pending && <p className="reason">上課前 {moveHours} 小時內不能改時間，需要的話請取消預約。</p>}
    </section>
  );
}

function OtherLesson({ l, moveHours }: { l: Lesson; moveHours: number }) {
  const [open, setOpen] = useState(false);
  const tooLate = hoursUntil(l) < moveHours;
  return (
    <>
      <div className="li">
        <div className="grow"><div className="name" style={{ fontSize: 16 }}>{fmtDate(l.date)} {l.time}</div><div className="cap">{fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]}</div></div>
        <LessonStatus l={l} />
        <button className="iconbtn" aria-label={`${fmtDate(l.date)} 的更多操作`} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="more" /></button>
      </div>
      {open && (
        <div className="li" style={{ background: 'var(--ivory)', justifyContent: 'flex-end' }}>
          {tooLate ? <span className="reason">上課前 {moveHours} 小時內不能改</span> : <Link className="btn secondary sm" to={`/app/lessons/${l.id}/move`}>改時間</Link>}
          <Link className="btn dtext" to={`/app/lessons/${l.id}/cancel`}>取消預約</Link>
        </div>
      )}
    </>
  );
}

export function StudentHome() {
  const me = useCurrentUser();
  const lessons = useMyLessons();
  const studio = useStudio();
  const moveHours = studio.data?.moveHours ?? MOVE_HOURS_FALLBACK;

  const { proposals, upcoming } = useMemo(() => {
    const all = (lessons.data ?? []).filter(isUpcoming).sort(compareSlot);
    return { proposals: all.filter((l) => l.change?.by === 'teacher'), upcoming: all };
  }, [lessons.data]);
  const [next, ...others] = upcoming;
  const free = me.credits;
  const attended = Math.max(0, Math.min(me.attended, me.packageSize - me.booked - free));

  return (
    <div className="page">
      <PageHead title={`哈囉，${me.name}`} over="首頁" />
      {studio.data && <TeacherStatusCard t={studio.data.teacher} />}
      {lessons.isPending ? <PageSkeleton blocks={[170, 190]} />
        : lessons.isError ? <ErrorCard error={lessons.error} retry={() => lessons.refetch()} />
        : (
          <>
            {proposals.map((l) => <ProposalCard key={l.change!.id} l={l} />)}
            {next ? <NextLesson l={next} moveHours={moveHours} />
              : <section className="card"><Empty text="還沒有預約的課。" action={<Link className="btn primary" to="/app/book">預約課程</Link>} /></section>}
            <section className="card hero" aria-label="我的堂數">
              <div className="row between"><h2 className="sec">我的堂數</h2><span className="hero-num">剩餘 {free} 堂</span></div>
              {me.packageSize > 0 && <Quota attended={attended} booked={me.booked} free={free} />}
              <div className="row">
                <Link className="btn primary grow" to="/app/book">預約課程</Link>
              </div>
              <Link className="btn link" style={{ alignSelf: 'flex-start' }} to="/app/quota">查看堂數與付款紀錄 →</Link>
            </section>
            {others.length > 0 && (
              <section className="stack s2" aria-label="其他預約"><h2 className="sec">其他預約</h2>
                <div className="list">{others.map((l) => <OtherLesson key={l.id} l={l} moveHours={moveHours} />)}</div></section>
            )}
          </>
        )}
      <Outlet />
    </div>
  );
}

/* ---------------------------------------------------------------- 取消 */
export function CancelSheet() {
  const { id } = useParams();
  const lessons = useMyLessons();
  const studio = useStudio();
  const { cancel, undo } = useCancelLesson();
  const toast = useToast();
  const close = useSheetClose('/app');
  const l = lessons.data?.find((x) => x.id === id);
  const cancelHours = studio.data?.cancelHours ?? 24;
  const refund = l ? hoursUntil(l) >= cancelHours : false;

  return (
    <RouteSheet title="取消預約" parent="/app">
      {!l ? <p className="sub">{lessons.isPending ? '載入中…' : '找不到這堂課。'}</p> : (
        <>
          <p><b>{fmtSlot(l.date, l.time)}</b>（{fmtDuration(l.minutes)}）</p>
          <div className="info">{refund ? `距離上課超過 ${cancelHours} 小時，會退回 1 堂。` : `距離上課不到 ${cancelHours} 小時，這堂不會退回。`}</div>
          {cancel.isError && <p className="err" role="alert">{errText(cancel.error)}</p>}
          <button className="btn danger block" disabled={cancel.isPending} onClick={() => cancel.mutate(l.id, {
            onSuccess: (r) => { close(); toast({ text: r.refunded ? '已取消，退回 1 堂' : '已取消（未退回堂數）', undo: () => undo(l.id) }); },
          })}>取消這堂課</button>
          <button className="btn secondary block" onClick={close}>先不要取消</button>
        </>
      )}
    </RouteSheet>
  );
}

/* ---------------------------------------------------------------- 改時間 */
export function Move() {
  const { id } = useParams();
  const nav = useNavigate();
  const lessons = useMyLessons();
  const studio = useStudio();
  const ask = useAskMove();
  const toast = useToast();
  const [pick, setPick] = useState<Picked | null>(null);
  const [reason, setReason] = useState('');
  const l = lessons.data?.find((x) => x.id === id);
  const moveHours = studio.data?.moveHours ?? MOVE_HOURS_FALLBACK;

  if (lessons.isPending) return <div className="page"><PageSkeleton /></div>;
  if (!l) return <div className="page"><PageHead title="改時間" back /><Empty text="找不到這堂課。" action={<Link className="btn secondary" to="/app">回首頁</Link>} /></div>;
  const tooLate = hoursUntil(l) < moveHours;

  return (
    <div className="page">
      <PageHead title="改時間" over="目前時段" back />
      <div className="card"><b>{fmtSlot(l.date, l.time)}</b><span className="cap">新時段要等 Iris 同意，在那之前原時段會保留。</span></div>
      {tooLate ? (
        <div className="card"><p>上課前 {moveHours} 小時內不能改時間。</p><Link className="btn danger" to={`/app/lessons/${l.id}/cancel`}>改為取消預約</Link></div>
      ) : (
        <>
          <section className="stack s2"><h2 className="sec">選擇新時段</h2><SlotPicker value={pick} onChange={setPick} ignore={{ date: l.date, time: l.time }} /></section>
          <div className="field"><label htmlFor="why">原因</label><textarea id="why" className="textarea" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="例如：臨時要加班" /></div>
          {ask.isError && <p className="err" role="alert">{errText(ask.error)}</p>}
          <button className="btn primary block" disabled={!pick || !reason.trim() || ask.isPending}
            onClick={() => pick && ask.mutate({ lessonId: l.id, date: pick.date, time: pick.time, reason: reason.trim() }, { onSuccess: () => { toast({ text: '已送出申請，等 Iris 回覆' }); nav('/app'); } })}>
            {!pick ? '請選擇時段' : !reason.trim() ? '請填寫原因' : '送出申請'}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- 預約 */
export function Book() {
  const me = useCurrentUser();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const d = sp.get('d'), t = sp.get('t');
  const pick: Picked | null = d && t ? { date: d, time: t } : null;
  const noCredit = me.credits < 1;

  return (
    <div className="page">
      <PageHead title="預約課程" over={`剩餘 ${me.credits} 堂`} />
      {noCredit && <div className="card"><p>目前沒有剩餘堂數。</p><Link className="btn primary" to="/app/quota">購買堂數</Link></div>}
      <SlotPicker value={pick} onChange={(p) => nav(p ? `?d=${p.date}&t=${p.time}` : '?', { replace: true })} />
      <div className="cta-float">
        <button className="btn primary block" disabled={!pick || noCredit} onClick={() => pick && nav(`confirm?d=${pick.date}&t=${pick.time}`)}>
          {noCredit ? '沒有剩餘堂數' : pick ? `確認預約 ${fmtSlot(pick.date, pick.time)}` : '請選擇時段'}
        </button>
      </div>
      <div className="cta-spacer" />
      <Outlet />
    </div>
  );
}

export function BookConfirm() {
  const me = useCurrentUser();
  const studio = useStudio();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const toast = useToast();
  const book = useBook();
  const key = useRef(newIdempotencyKey());
  const [done, setDone] = useState(false);
  const date = sp.get('d') ?? '', time = sp.get('t') ?? '';
  const close = useSheetClose('/app/book');

  const confirm = () => book.mutate({ date, time, key: key.current }, {
    onSuccess: () => setDone(true),
    onError: (e) => {
      toast({ text: e instanceof ApiError && e.code === 'slot_taken' ? '沒有扣堂數，請選其他時段' : errText(e), kind: 'error' });
      close();
    },
  });

  return (
    <RouteSheet title={done ? '預約完成' : '確認預約'} parent="/app/book">
      {done ? (
        <>
          <div className="info"><b>{fmtSlot(date, time)}</b><br />我們已幫你保留這個時段。</div>
          <button className="btn primary block" onClick={() => nav('/app', { replace: true })}>回首頁</button>
        </>
      ) : (
        <>
          <div className="card flat"><div className="hero-num">{fmtSlot(date, time)}</div><div className="sub">{fmtDuration(studio.data?.lessonMinutes ?? 60)} · {CLASS_TYPE_LABEL[me.classType]}</div></div>
          <p className="sub">這堂會用掉 1 堂，預約後剩 {Math.max(0, me.credits - 1)} 堂。</p>
          <div className="row"><button className="btn secondary grow" onClick={close}>返回</button><button className="btn primary wide" disabled={book.isPending} onClick={confirm}>確認預約</button></div>
        </>
      )}
    </RouteSheet>
  );
}

/* ---------------------------------------------------------------- 行事曆 */
const markOf = (l: Lesson) => (l.change ? { c: '◆', k: 'mk-chg' } : l.status === 'Attended' ? { c: '○', k: 'mk-done' } : { c: '●', k: 'mk-up' });

export function StudentCalendar() {
  const lessons = useMyLessons();
  const today = studioToday();
  const [view, setView] = useState<'month' | 'list'>('month');
  const [filter, setFilter] = useState<'upcoming' | 'today' | 'past'>('upcoming');
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const [sel, setSel] = useState(today);
  const shown = (lessons.data ?? []).filter((l) => l.status !== 'Cancelled');
  const byDate = (d: string) => shown.filter((l) => l.date === d).sort(compareSlot);
  const step = (n: number) => setYm(({ y, m }) => { const t = new Date(Date.UTC(y, m - 1 + n, 1)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 }; });

  const list = shown.filter((l) => (filter === 'today' ? l.date === today : filter === 'past' ? l.date < today : l.date >= today)).sort((a, b) => (filter === 'past' ? compareSlot(b, a) : compareSlot(a, b)));

  const row = (l: Lesson) => (
    <div key={l.id} className="li">
      <DateBox date={l.date} />
      <div className="grow"><div className="name" style={{ fontSize: 16 }}>{l.time} · {LESSON_TYPE_LABEL[l.type]}</div><div className="cap">{fmtDate(l.date)} · {fmtDuration(l.minutes)}</div></div>
      {l.change ? <Tag tone="warn">改時間中</Tag> : l.status === 'Attended' ? <Tag tone="grey">已上課</Tag> : <Tag tone="accent">已預約</Tag>}
    </div>
  );

  return (
    <div className="page">
      <PageHead title="行事曆" />
      <Segmented label="檢視方式" value={view} onChange={setView} options={[{ value: 'month', label: '月曆' }, { value: 'list', label: '列表' }]} />
      {lessons.isPending ? <PageSkeleton blocks={[300]} /> : lessons.isError ? <ErrorCard error={lessons.error} retry={() => lessons.refetch()} /> : view === 'month' ? (
        <>
          <div className="card">
            <div className="row between"><button className="iconbtn" aria-label="上個月" onClick={() => step(-1)}><Icon name="back" /></button><h2 className="sec">{ym.y} 年 {ym.m} 月</h2><button className="iconbtn" aria-label="下個月" onClick={() => step(1)}><Icon name="chev" /></button></div>
            <div className="cal" role="grid">
              {['一', '二', '三', '四', '五', '六', '日'].map((w) => <div key={w} className="wd">{w}</div>)}
              {monthGrid(ym.y, ym.m).map((d) => {
                const ls = byDate(d);
                return (
                  <button key={d} className={`${monthNum(d) !== ym.m ? 'out' : ''} ${d === today ? 'today' : ''}`} aria-pressed={d === sel} onClick={() => setSel(d)} aria-label={`${monthNum(d)} 月 ${dayNum(d)} 日${ls.length ? `，${ls.length} 堂課` : ''}`}>
                    {dayNum(d)}<span className="marks" aria-hidden>{ls.slice(0, 3).map((l) => <span key={l.id} className={markOf(l).k}>{markOf(l).c}</span>)}</span>
                  </button>
                );
              })}
            </div>
            <div className="legend"><span className="mk-up">● 即將上課</span><span className="mk-done">○ 已上課</span><span className="mk-chg">◆ 改時間中</span></div>
          </div>
          <section className="stack s2"><h2 className="sec">{fmtDate(sel)}</h2>
            {byDate(sel).length ? <div className="list">{byDate(sel).map(row)}</div> : <Empty text="這天沒有課。" action={sel >= today ? <Link className="btn secondary sm" to="/app/book">預約課程</Link> : undefined} />}</section>
        </>
      ) : (
        <>
          <div className="chips" role="group" aria-label="篩選">
            {([['upcoming', '即將'], ['today', '今天'], ['past', '過去']] as const).map(([k, t]) => <button key={k} className="chip filter" aria-pressed={filter === k} onClick={() => setFilter(k)}>{t}</button>)}
          </div>
          {list.length ? <div className="list">{list.map(row)}</div> : <Empty text="沒有符合的課。" />}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- 堂數與付款 */
const PAY_TAG = { Pending: <Tag tone="pending">確認中</Tag>, Confirmed: <Tag tone="ok">已確認</Tag>, Rejected: <Tag tone="bad">已退回</Tag> } as const;
const MAX_RECEIPT = 5 * 1024 * 1024;

export function QuotaPage() {
  const me = useCurrentUser();
  const studio = useStudio();
  const payments = useMyPayments();
  const upload = useUploadReceipt();
  const toast = useToast();
  const [size, setSize] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [fileErr, setFileErr] = useState('');
  const key = useRef(newIdempotencyKey());

  const all = studio.data?.packages ?? [];
  // A 體驗 student who hasn't tried yet sees only the 體驗課 package (ST-6).
  const visible = me.classType === 'trial' && me.trialAvailable ? all.filter((p) => p.trial) : all.filter((p) => !p.trial);
  const waiting = (payments.data ?? []).some((p) => p.status === 'Pending');
  const free = me.credits;
  const attended = Math.max(0, Math.min(me.attended, me.packageSize - me.booked - free));
  const chosen = size ?? visible[0]?.size ?? null;

  const pickFile = (f: File | undefined) => {
    setFileErr('');
    if (!f) return setFile(null);
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setFileErr('請選擇 JPG、PNG 或 WEBP 圖片。'); return setFile(null); }
    if (f.size > MAX_RECEIPT) { setFileErr('圖片請小於 5 MB。'); return setFile(null); }
    setFile(f);
  };
  const submit = () => {
    if (!file || chosen == null) return;
    const form = new FormData(); form.append('packageSize', String(chosen)); form.append('receipt', file); if (note.trim()) form.append('note', note.trim());
    upload.mutate({ form, key: key.current }, {
      onSuccess: () => { toast({ text: '收據已送出，等 Iris 確認' }); setFile(null); setNote(''); key.current = newIdempotencyKey(); },
      onError: (e) => toast({ text: errText(e), kind: 'error' }),
    });
  };

  return (
    <div className="page">
      <PageHead title="堂數與付款" back />
      <section className="card hero">
        <div className="row between"><h2 className="sec">我的堂數</h2><span className="hero-num">剩餘 {free} 堂</span></div>
        {me.packageSize > 0 && <Quota attended={attended} booked={me.booked} free={free} />}
        <p className="cap">堂數沒有期限，新買的會加在剩下的堂數上。</p>
      </section>

      <section className="card">
        <h2 className="sec">匯款資料</h2>
        {studio.data ? <div className="info"><b>{studio.data.bank.name}</b><br />帳號 {studio.data.bank.account}<br />戶名 {studio.data.bank.holder}</div> : <p className="sub">載入中…</p>}
        <div className="stack s2" role="radiogroup" aria-label="選擇方案">
          {visible.map((p) => (
            <button key={p.size} role="radio" aria-checked={chosen === p.size} className="chip choice" style={{ borderRadius: 14, textAlign: 'left', padding: '0 16px', display: 'flex', justifyContent: 'space-between' }} onClick={() => setSize(p.size)}>
              <span>{p.trial ? '體驗課' : '方案'} · {p.size} 堂</span><span>{fmtMoney(p.price)}</span>
            </button>
          ))}
        </div>
        {waiting ? <div className="info">已有一張收據在等 Iris 確認，確認後就可以再上傳。</div> : (
          <>
            <div className="field"><label htmlFor="rc">轉帳收據（JPG／PNG／WEBP，5 MB 內）</label>
              <input id="rc" className="input" style={{ paddingTop: 10 }} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pickFile(e.target.files?.[0])} aria-describedby={fileErr ? 'rc-err' : undefined} />
              {fileErr && <span id="rc-err" className="err">{fileErr}</span>}</div>
            <div className="field"><label htmlFor="rn">備註（選填，例如帳號末五碼）</label><input id="rn" className="input" value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} /></div>
            <button className="btn primary block" disabled={!file || chosen == null || upload.isPending} onClick={submit}><Icon name="upload" size={18} />上傳收據</button>
          </>
        )}
      </section>

      <section className="stack s2"><h2 className="sec">付款紀錄</h2>
        {payments.isPending ? <ListSkeleton rows={2} /> : !payments.data?.length ? <Empty text="還沒有付款紀錄。" /> : (
          <div className="list">{payments.data.map((p: Payment) => (
            <div key={p.id} className="li"><div className="grow"><div className="name" style={{ fontSize: 16 }}>{p.trial ? '體驗課' : '方案'} · {p.packageSize} 堂</div>
              <div className="cap">{fmtRelative(p.uploadedAt)} · {fmtMoney(p.amount)}{p.status === 'Rejected' && p.rejectReason ? ` · 「${p.rejectReason}」` : ''}</div></div>{PAY_TAG[p.status]}</div>
          ))}</div>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- 通知 */
export function Alerts() {
  const alerts = useAlerts();
  const { mutation, undo } = useMarkAllRead();
  const toast = useToast();
  const unread = (alerts.data ?? []).filter((a) => !a.read).map((a) => a.id);

  return (
    <div className="page">
      <PageHead title="通知" right={unread.length > 0 && (
        <button className="btn link" onClick={() => mutation.mutate(unread, { onSuccess: () => toast({ text: '已全部標為已讀', undo: () => undo(unread) }) })}>全部已讀</button>
      )} />
      {alerts.isPending ? <ListSkeleton /> : alerts.isError ? <ErrorCard error={alerts.error} retry={() => alerts.refetch()} /> : !alerts.data.length ? <Empty text="目前沒有通知。" /> : (
        <div className="list">{alerts.data.map((a) => (
          <div key={a.id} className="li" style={{ alignItems: 'flex-start' }}>
            <span aria-hidden style={{ width: 10, paddingTop: 8 }}>{!a.read && <i className="dot" style={{ position: 'static', display: 'block' }} />}</span>
            <div className="grow"><div className="name" style={{ fontSize: 16 }}>{a.title}{!a.read && <span className="sr">（未讀）</span>}</div>
              <p className="sub">{a.body}</p>
              {a.kind === 'proposal' && <Link className="btn link" to="/app">到首頁回覆 →</Link>}
              <div className="cap">{fmtRelative(a.createdAt)}</div></div>
          </div>
        ))}</div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- 我的 */
export function Profile() {
  const me = useCurrentUser();
  const update = useUpdateProfile();
  const toast = useToast();
  const [f, setF] = useState({ name: me.name, email: me.email ?? '', phone: me.phone ?? '', lineId: me.lineId ?? '', voiceType: me.voiceType ?? '', goal: me.goal ?? '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const bad = !f.name.trim() || (f.email.trim() !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()));

  return (
    <div className="page">
      <PageHead title="我的" />
      <form className="card" onSubmit={(e) => { e.preventDefault(); if (!bad) update.mutate({ name: f.name.trim(), email: f.email.trim() || null, phone: f.phone.trim() || null, lineId: f.lineId.trim() || null, voiceType: f.voiceType.trim() || null, goal: f.goal.trim() || null }, { onSuccess: () => toast({ text: '已儲存' }), onError: (er) => toast({ text: errText(er), kind: 'error' }) }); }}>
        <div className="field"><label htmlFor="p-name">姓名</label><input id="p-name" className="input" autoComplete="name" value={f.name} onChange={set('name')} aria-invalid={!f.name.trim() || undefined} /></div>
        <div className="field"><label htmlFor="p-mail">Email</label><input id="p-mail" className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} /></div>
        <div className="field"><label htmlFor="p-tel">電話</label><input id="p-tel" className="input" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></div>
        <div className="field"><label htmlFor="p-line">LINE ID</label><input id="p-line" className="input" value={f.lineId} onChange={set('lineId')} /></div>
        <div className="field"><label htmlFor="p-voice">聲部</label>
          <select id="p-voice" className="select" value={f.voiceType} onChange={set('voiceType')}><option value="">還不確定</option>{['女高音', '女中音', '女低音', '男高音', '男中音', '男低音'].map((v) => <option key={v}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="p-goal">想達成的目標</label><textarea id="p-goal" className="textarea" value={f.goal} maxLength={300} onChange={set('goal')} /></div>
        <button className="btn primary block" disabled={bad || update.isPending}>儲存</button>
      </form>
      <EmailSettings />
      <ConsentSettings />
      <LogoutButton />
    </div>
  );
}

function LogoutButton() {
  const logout = useLogout();
  const nav = useNavigate();
  return <button className="btn secondary block" onClick={() => { nav('/'); logout.mutate(); }}><Icon name="logout" size={18} />登出</button>;
}

const KIND_LABEL = { terms: '服務條款', privacy: '隱私權政策（告知）', media: '肖像影音宣傳', marketing: '行銷訊息', guardian: '法定代理人同意' } as const;

/**
 * 同意設定: the two OPTIONAL consents, changeable any time. Every change becomes a new record (never an edit),
 * so the history below is the proof of what was agreed, when, and to which version.
 */
function ConsentSettings() {
  const q = useMyConsents();
  const save = useSaveConsents();
  const toast = useToast();
  const [guardianOk, setGuardianOk] = useState(false);
  if (!q.data) return null;
  const d = q.data;
  const change = (k: 'media' | 'marketing', on: boolean) => {
    if (on && d.minor && !guardianOk) { toast({ text: '未滿 18 歲，請先由法定代理人勾選確認。', kind: 'error' }); return; }
    save.mutateAsync({ version: CONSENT_VERSION, terms: true, media: k === 'media' ? on : d.media.granted, marketing: k === 'marketing' ? on : d.marketing.granted, minor: false,
      guardian: d.minor && on ? { name: d.guardianName ?? '', relation: '法定代理人', contact: '-', agreed: true } : null })
      .then(() => toast({ text: on ? '已同意，可隨時在這裡撤回' : k === 'media' ? '已撤回。IRIS 不會再使用你的照片、影片或聲音，已公開的內容會盡快移除。' : '已取消，不會再收到行銷訊息' }))
      .catch((e) => toast({ text: (e as Error).message, kind: 'error' }));
  };
  const row = (k: 'media' | 'marketing', title: string, text: string) => (
    <div className="cn-row">
      <div><p className="t" id={`cn-${k}`}>{title}</p><p className="caption" id={`cn-${k}-d`}>{text}</p>
        <p className={`cn-state ${d[k].granted ? 'on' : ''}`}>{d[k].granted ? '● 已同意' : '○ 未同意'}{d[k].at ? ` · ${new Date(d[k].at!).toLocaleDateString('zh-TW')}` : ''}</p></div>
      <button className="switch" role="switch" aria-checked={d[k].granted} aria-labelledby={`cn-${k}`} aria-describedby={`cn-${k}-d`} disabled={save.isPending} onClick={() => change(k, !d[k].granted)} />
    </div>
  );
  return (
    <section className="card cn-card" aria-labelledby="cn-h">
      <h2 className="h3" id="cn-h">同意設定</h2>
      <p className="caption">以下都是選擇性同意，不同意也能正常上課。</p>
      {row('media', '肖像影音宣傳', CONSENT_TEXT.media)}
      {row('marketing', '行銷訊息', CONSENT_TEXT.marketing)}
      {d.minor && (
        <label className="au-ck cn-guardian"><input type="checkbox" checked={guardianOk} onChange={(e) => setGuardianOk(e.target.checked)} />
          <span>我是法定代理人{d.guardianName ? `（${d.guardianName}）` : ''}，同意開啟上方項目。<em>撤回不需要確認。</em></span></label>
      )}
      <details className="cn-hist"><summary>同意紀錄 · {d.history.length}</summary>
        <ul>{d.history.map((h, i) => <li key={i}><span>{KIND_LABEL[h.kind]}：{h.granted ? '同意' : '撤回／不同意'}</span><span>{new Date(h.at).toLocaleString('zh-TW')} · 版本 {h.version}</span></li>)}</ul>
      </details>
      <p className="caption">要查詢、更正或刪除你的資料，請到<Link to="/legal/privacy-request">個人資料權利申請</Link>。</p>
    </section>
  );
}

