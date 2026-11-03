import { useMemo, useState } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { RouteSheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { BlurImage, DateBox, Empty, ErrorCard, ListSkeleton, PageHead, PageSkeleton, Quota, Sk, Tag } from '../components/ui';
import { newIdempotencyKey } from '../lib/api';
import { compareSlot, dayNum, initialOf, fmtDate, fmtMoney, fmtRelative, fmtSlot, monthGrid, studioToday } from '../lib/date';
import { monthRange } from '../lib/prefetch';
import {
  useAdjustCredits, useConsults, useDecideApplication, useDecideChange, useDecidePayment, useLessons, useMarkContacted,
  useMe, useOverview, usePayments, useRequests, useStudent, useStudents, useTeacherCancel,
} from '../lib/queries';
import type { Lesson, Payment, PaymentStatus, StudentSummary } from '../lib/types';

const greeting = () => { const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: 'numeric', hour12: false }).format(new Date())); return h < 11 ? '早安' : h < 18 ? '午安' : '晚安'; };
const initial = initialOf;

function Kpi({ to, title, n, detail }: { to: string; title: string; n: number; detail: string }) {
  return (
    <Link to={to} className="kpi" viewTransition>
      <span className="kt">{title}<Icon name="chev" size={18} /></span>
      <span className="kn"><span className="big">{n}</span>{n > 0 ? <Tag tone="warn">待處理</Tag> : <Tag tone="grey">無</Tag>}</span>
      <span className="caption">{detail}</span>
    </Link>
  );
}

/* =================== Home =================== */
export function TeacherHome() {
  const me = useMe().data!;
  const ov = useOverview();
  const today = studioToday();
  const c = ov.data?.counts;
  const open = c ? c.receipts + c.changes + c.applications + c.consults : 0;
  return (
    <>
      <div className="stack g1"><p className="overline">{fmtDate(today)}</p><h1 className="h1">{greeting()}，{me.name}</h1>
        <p className="caption">{ov.data ? `今天 ${ov.data.today.length} 堂課 · ${open} 件待處理` : ' '}</p></div>
      {ov.isPending ? <><div className="kpis">{[0, 1, 2, 3].map((i) => <Sk key={i} h={120} card />)}</div><ListSkeleton rows={3} /></>
        : ov.isError ? <ErrorCard error={ov.error} retry={ov.refetch} /> : (
        <>
          <div className="kpis">
            <Kpi to="/teacher/payments" title="待確認收據" n={c!.receipts} detail={c!.receipts ? fmtMoney(c!.receiptsAmount) : '都已確認'} />
            <Kpi to="/teacher/requests" title="改時間申請" n={c!.changes} detail={c!.changes ? '請確認新時段' : '沒有新的申請'} />
            <Kpi to="/teacher/requests?tab=apps" title="新學生" n={c!.applications} detail={c!.applications ? '等待你確認帳號' : '沒有新的申請'} />
            <Kpi to="/teacher/consults" title="諮詢" n={c!.consults} detail={c!.consults ? '還沒聯絡' : '都已聯絡'} />
          </div>
          <div className="split">
            <section className="card"><div className="row between"><p className="overline">今天的課</p><Link to="/teacher/calendar" className="caption" style={{ color: 'var(--sage-800)', fontWeight: 500 }} viewTransition>完整行事曆</Link></div>
              {ov.data!.today.length ? <div className="list">{ov.data!.today.map((l) => <LessonRow key={l.id} l={l} />)}</div> : <p className="caption">今天沒有課。</p>}
            </section>
            <section className="card"><p className="overline">堂數用完</p>
              {ov.data!.outOfQuota.length ? <div className="list">{ov.data!.outOfQuota.map((s) => <StudentRow key={s.id} s={s} />)}</div> : <p className="caption">每位學生都還有堂數。</p>}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function LessonRow({ l, actions }: { l: Lesson; actions?: React.ReactNode }) {
  const past = l.date < studioToday() || l.status === 'Attended';
  return (
    <div className="li">
      <p className="t" style={{ width: 52 }}>{l.time}</p>
      <div className="grow stack g1"><p className="t">{l.studentName}</p>
        {l.status === 'Cancelled' ? <Tag tone="bad">已取消</Tag> : past ? <Tag tone="grey">已上課</Tag> : l.change ? <Tag tone="warn">改時間中</Tag> : <Tag tone="ok">已預約</Tag>}</div>
      {actions}
    </div>
  );
}

function StudentRow({ s }: { s: StudentSummary }) {
  const tone = s.status === 'Pending' ? 'warn' : s.credits === 0 ? 'bad' : s.credits === 1 ? 'warn' : 'ok';
  const word = s.status === 'Pending' ? '確認中' : s.credits === 0 ? '用完' : s.credits === 1 ? '快用完' : '正常';
  const meta = s.status === 'Pending' ? '新學生 · 等待確認' : `剩 ${s.credits} 堂 · ${s.paymentPending ? '收據待確認' : s.nextLesson ? `下次 ${fmtSlot(s.nextLesson.date, s.nextLesson.time)}` : '沒有預約'}`;
  return (
    <Link to={`/teacher/students/${s.id}`} className="li" viewTransition>
      <span className="avatar">{initial(s.name)}</span>
      <div className="grow stack g1"><p className="t">{s.name}</p><p className="caption">{meta}</p></div>
      <Tag tone={tone}>{word}</Tag><Icon name="chev" size={18} />
    </Link>
  );
}

/* =================== Calendar =================== */
export function TeacherCalendar() {
  const [from, to] = monthRange();
  const lessons = useLessons('teacher', from, to);
  const { cancel, undo } = useTeacherCancel();
  const toast = useToast();
  const today = studioToday();
  const [ym, setYm] = useState(() => [Number(today.slice(0, 4)), Number(today.slice(5, 7))]);
  const [sel, setSel] = useState(today);
  const byDay = useMemo(() => { const m = new Map<string, Lesson[]>(); (lessons.data ?? []).filter((l) => l.status !== 'Cancelled').forEach((l) => m.set(l.date, [...(m.get(l.date) ?? []), l])); return m; }, [lessons.data]);
  const shift = (d: number) => setYm(([y, m]) => { const t = m + d; return t < 1 ? [y - 1, 12] : t > 12 ? [y + 1, 1] : [y, t]; });
  const dayLessons = (byDay.get(sel) ?? []).sort(compareSlot);

  return (
    <>
      <PageHead title="行事曆" over={`${ym[0]} 年 ${ym[1]} 月`} />
      {lessons.isPending ? <PageSkeleton blocks={[360]} /> : (
        <div className="split">
          <section className="card" style={{ padding: 16 }}>
            <div className="row between"><button className="icon-btn flat" aria-label="上個月" onClick={() => shift(-1)}><Icon name="back" /></button>
              <p className="t">{ym[0]} 年 {ym[1]} 月</p><button className="icon-btn flat" aria-label="下個月" onClick={() => shift(1)}><Icon name="chev" /></button></div>
            <div className="cal">
              {['一', '二', '三', '四', '五', '六', '日'].map((w) => <span className="wd" key={w}>{w}</span>)}
              {monthGrid(ym[0], ym[1]).map((d) => {
                const n = byDay.get(d)?.length ?? 0;
                return (
                  <button key={d} className={`${d.slice(5, 7) !== String(ym[1]).padStart(2, '0') ? 'out' : ''}${d === today ? ' today' : ''}`}
                    aria-pressed={sel === d} aria-label={`${fmtDate(d)}${n ? `，${n} 堂課` : ''}`} onClick={() => setSel(d)}>
                    <span>{dayNum(d)}</span><i className={n ? (d < today ? 'past' : 'up') : ''} />
                  </button>
                );
              })}
            </div>
          </section>
          <section className="card"><p className="overline">{sel === today ? '今天 · ' : ''}{fmtDate(sel)}</p>
            {dayLessons.length ? <div className="list">{dayLessons.map((l) => (
              <LessonRow key={l.id} l={l} actions={l.status === 'Booked' && l.date >= today ? (
                <button className="btn sm danger" disabled={cancel.isPending}
                  onClick={() => cancel.mutate(l.id, { onSuccess: () => toast({ text: `已取消 ${l.studentName} ${fmtSlot(l.date, l.time)}，堂數已退回`, undo: async () => { await undo(l.id); } }) })}>取消</button>
              ) : undefined} />
            ))}</div> : <Empty text="這天沒有課。" />}
            <p className="caption">老師取消課程時，堂數一定退回，並在 10 秒後通知學生（可以先復原）。</p>
          </section>
        </div>
      )}
    </>
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
      <label className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名或 LINE ID" aria-label="搜尋學生" /></label>
      <div className="fchips" role="group" aria-label="篩選">
        <button className="fchip" aria-pressed={f === 'all'} onClick={() => setF('all')}>全部</button>
        <button className="fchip" aria-pressed={f === 'out'} onClick={() => setF('out')}>堂數用完 ({count((s) => s.status === 'Active' && s.credits === 0)})</button>
        <button className="fchip" aria-pressed={f === 'pay'} onClick={() => setF('pay')}>待付款 ({count((s) => s.paymentPending)})</button>
      </div>
      {students.isPending ? <ListSkeleton rows={6} /> : <section className="card tight"><div className="list">{list.length ? list.map((s) => <StudentRow key={s.id} s={s} />) : <p className="caption" style={{ padding: '16px 0' }}>找不到學生。</p>}</div></section>}
    </>
  );
}

export function StudentDetailPage() {
  const { id } = useParams();
  const s = useStudent(id!);
  const adjust = useAdjustCredits(id!);
  const toast = useToast();
  if (s.isPending) return <PageSkeleton blocks={[120, 200, 160]} />;
  if (s.isError) return <ErrorCard error={s.error} retry={s.refetch} />;
  const d = s.data;
  const total = Math.max(d.packageSize, d.attended + d.booked + d.credits);
  const change = (delta: number) => adjust.mutate(delta, {
    onSuccess: () => toast({ text: `${d.name} ${delta > 0 ? '+1' : '−1'} 堂（已記錄並通知）`, undo: () => new Promise<void>((res, rej) => adjust.mutate(-delta, { onSuccess: () => res(), onError: rej })) }),
    onError: (e) => toast({ text: (e as Error).message, kind: 'error' }),
  });
  return (
    <>
      <div className="row"><Link to="/teacher/students" className="icon-btn" aria-label="返回學生列表" viewTransition><Icon name="back" /></Link><p className="overline">學生</p></div>
      <div className="inner row" style={{ gap: 16 }}><span className="avatar lg">{initial(d.name)}</span>
        <div className="grow stack g1"><p className="h3">{d.name}</p><p className="caption">{[d.voiceType, d.grade, d.lineId && `LINE ${d.lineId}`].filter(Boolean).join(' · ') || '—'}</p></div></div>
      <div className="split">
        <div className="stack g4">
          <section className="card"><p className="overline">堂數</p>
            <div className="row between"><p className="big">剩餘 {d.credits} 堂</p>
              <div className="row g2">
                <button className="icon-btn" aria-label="減少 1 堂" disabled={d.credits <= 0 || adjust.isPending} onClick={() => change(-1)}><Icon name="minus" /></button>
                <button className="icon-btn" aria-label="增加 1 堂" disabled={adjust.isPending} onClick={() => change(1)}><Icon name="plus" /></button>
              </div></div>
            <Quota attended={Math.max(0, Math.min(d.attended, total - d.booked - d.credits))} booked={d.booked} free={d.credits} />
            <p className="caption">手動調整會留下紀錄，並通知學生。</p>
          </section>
          <section className="card"><p className="overline">付款</p>
            {d.payments.length ? <div className="list">{d.payments.map((p) => <div className="li" key={p.id}><div className="grow stack g1"><p className="t">{p.packageSize} 堂 · {fmtMoney(p.amount)}</p><p className="caption">{fmtRelative(p.uploadedAt)}</p></div><PayTag s={p.status} /></div>)}</div> : <p className="caption">沒有付款紀錄。</p>}
          </section>
        </div>
        <div className="stack g4">
          <section className="card"><p className="overline">即將上課</p>
            {d.upcoming.length ? <div className="list">{d.upcoming.map((l) => <div className="li" key={l.id}><DateBox date={l.date} /><div className="grow stack g1"><p className="t">{fmtSlot(l.date, l.time)}</p><p className="caption">{l.change ? `申請改到 ${fmtSlot(l.change.toDate, l.change.toTime)}` : l.room}</p></div>{l.change ? <Tag tone="warn">改時間中</Tag> : <Tag tone="ok">已確認</Tag>}</div>)}</div> : <p className="caption">沒有預約。</p>}
          </section>
          <section className="card"><p className="overline">上過的課</p>
            {d.past.length ? <div className="list">{d.past.map((l) => <div className="li" key={l.id}><DateBox date={l.date} /><p className="t grow">{fmtSlot(l.date, l.time)}</p><Tag tone="grey">已上課</Tag></div>)}</div> : <p className="caption">還沒有上過課。</p>}
          </section>
        </div>
      </div>
    </>
  );
}
const PayTag = ({ s }: { s: PaymentStatus }) => <Tag tone={s === 'Confirmed' ? 'ok' : s === 'Rejected' ? 'bad' : 'warn'}>{{ Confirmed: '已確認', Rejected: '已退回', Pending: '待確認' }[s]}</Tag>;

/* =================== Requests =================== */
export function RequestsPage() {
  const req = useRequests();
  const ch = useDecideChange();
  const app = useDecideApplication();
  const toast = useToast();
  const [tab, setTab] = useState<'changes' | 'apps'>(() => (new URLSearchParams(location.search).get('tab') === 'apps' ? 'apps' : 'changes'));
  const changes = req.data?.changes ?? [], apps = req.data?.applications ?? [];
  const fail = (e: unknown) => toast({ text: (e as Error).message, kind: 'error' });

  return (
    <>
      <PageHead title="申請" />
      <div className="seg" role="tablist" aria-label="申請類型">
        <button role="tab" aria-selected={tab === 'changes'} onClick={() => setTab('changes')}>改時間 ({changes.length})</button>
        <button role="tab" aria-selected={tab === 'apps'} onClick={() => setTab('apps')}>新學生 ({apps.length})</button>
      </div>
      {req.isPending ? <ListSkeleton rows={2} /> : req.isError ? <ErrorCard error={req.error} retry={req.refetch} /> : tab === 'changes' ? (
        <section className="card tight">
          {changes.length === 0 ? <p className="caption" style={{ padding: '16px 0' }}>沒有待處理的改時間申請。</p> : (
            <div className="list">{changes.map((c) => (
              <div className="li col" key={c.id}>
                <div className="row"><span className="avatar">{initial(c.studentName)}</span>
                  <div className="grow stack g1"><p className="t">{c.studentName}</p><p className="caption">{fmtSlot(c.fromDate, c.fromTime)} → <b style={{ color: 'var(--ink)' }}>{fmtSlot(c.toDate, c.toTime)}</b></p></div></div>
                {c.reason && <p className="caption">「{c.reason}」</p>}
                <div className="row between"><Tag tone={c.slotFree ? 'ok' : 'bad'}>{c.slotFree ? '新時段可用' : '新時段已被預約'}</Tag>
                  <div className="row g2">
                    <Link to={`${c.id}/decline`} className="btn danger sm">婉拒</Link>
                    <button className="btn primary sm" disabled={!c.slotFree}
                      onClick={() => ch.mutation.mutate({ id: c.id, approve: true }, { onSuccess: () => toast({ text: `已同意，10 秒後通知${c.studentName}`, undo: () => ch.undo(c.id) }), onError: fail })}>同意</button>
                  </div></div>
                {!c.slotFree && <p className="caption">這個時段已經有人，只能婉拒並請學生選別的時間。</p>}
              </div>))}</div>
          )}
        </section>
      ) : (
        <section className="card tight">
          {apps.length === 0 ? <p className="caption" style={{ padding: '16px 0' }}>沒有新的學生申請。</p> : (
            <div className="list">{apps.map((a) => (
              <div className="li" key={a.id}><span className="avatar">{initial(a.name)}</span>
                <div className="grow stack g1"><p className="t">{a.name}</p><p className="caption">{a.email ?? 'LINE 登入'} · {fmtRelative(a.createdAt)}</p></div>
                <button className="btn danger sm" onClick={() => app.mutation.mutate({ id: a.id, approve: false }, { onSuccess: () => toast({ text: `已婉拒${a.name}`, undo: () => app.undo(a.id) }), onError: fail })}>婉拒</button>
                <button className="btn primary sm" onClick={() => app.mutation.mutate({ id: a.id, approve: true }, { onSuccess: () => toast({ text: `已確認${a.name}的帳號`, undo: () => app.undo(a.id) }), onError: fail })}>確認</button>
              </div>))}</div>
          )}
        </section>
      )}
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
      <PageHead title="付款" />
      <div className="seg" role="tablist" aria-label="收據狀態">
        {(['Pending', 'Confirmed', 'Rejected'] as const).map((s) => <button key={s} role="tab" aria-selected={st === s} onClick={() => setSt(s)}>{{ Pending: '待確認', Confirmed: '已確認', Rejected: '已退回' }[s]}</button>)}
      </div>
      {st === 'Pending' && pays.data && <p className="caption">待確認 {pays.data.length} 筆 · 共 {fmtMoney(total)}。確認後堂數會自動加到學生帳號。</p>}
      {pays.isPending ? <ListSkeleton rows={2} /> : pays.isError ? <ErrorCard error={pays.error} retry={pays.refetch} /> : (
        <section className="card tight">
          {pays.data!.length === 0 ? <p className="caption" style={{ padding: '16px 0' }}>沒有收據。</p> : <div className="list">{pays.data!.map((p) => <PaymentRow key={p.id} p={p} />)}</div>}
        </section>
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
  return (
    <div className="li col">
      <div className="row">
        <button className="avatar" style={{ borderRadius: 8, width: 56, height: 56, border: 0, cursor: 'pointer' }} aria-label={`查看 ${p.studentName} 的收據`} onClick={() => setShow(!show)}>
          <Icon name="image" size={22} /></button>
        <div className="grow stack g1"><p className="t">{p.studentName}</p><p className="caption">{p.packageSize} 堂 · {fmtMoney(p.amount)}</p><p className="caption">{fmtRelative(p.uploadedAt)} 上傳{p.note ? ` · ${p.note}` : ''}</p></div>
        <PayTag s={p.status} />
      </div>
      {show && (p.receiptUrl ? <BlurImage src={p.receiptUrl} lqip={p.lqip} alt={`${p.studentName} 的收據`} style={{ height: 320, borderRadius: 8 }} /> : <p className="caption">（示範資料沒有圖片）</p>)}
      {p.rejectReason && <p className="caption">退回原因：{p.rejectReason}</p>}
      {p.status === 'Pending' && (
        <div className="row g2" style={{ justifyContent: 'flex-end' }}>
          <Link to={`${p.id}/reject`} className="btn danger sm">退回</Link>
          <button className="btn primary sm" disabled={mutation.isPending}
            onClick={() => mutation.mutate({ id: p.id, confirm: true, key }, {
              onSuccess: () => toast({ text: `已確認，${p.studentName} +${p.packageSize} 堂`, undo: () => undo(p.id) }),
              onError: (e) => toast({ text: (e as Error).message, kind: 'error' }),
            })}>確認，加 {p.packageSize} 堂</button>
        </div>
      )}
    </div>
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
      <PageHead title="諮詢" over="來自網站的免費諮詢表單" />
      {cs.isPending ? <ListSkeleton rows={2} /> : (
        <section className="card tight">
          {cs.data!.length === 0 ? <p className="caption" style={{ padding: '16px 0' }}>還沒有諮詢申請。網站表單送出後會出現在這裡。</p> : (
            <div className="list">{cs.data!.map((c) => (
              <div className="li col" key={c.id}>
                <div className="row"><span className="avatar">{initial(c.name)}</span>
                  <div className="grow stack g1"><p className="t">{c.name}</p><p className="caption">{c.contact} · 希望 {fmtDate(c.preferredDate)}</p></div>
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
