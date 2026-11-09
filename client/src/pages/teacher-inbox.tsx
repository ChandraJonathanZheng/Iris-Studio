import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { ApiError, newIdempotencyKey } from '../lib/api';
import { fmtMoney, fmtRelative, fmtSlot } from '../lib/date';
import { useOverview, useDecideApplication, useDecideChange, useDecidePayment, usePayments, useProposals, useRequests } from '../lib/queries';
import type { ChangeRequest, Payment, PaymentStatus, Proposal } from '../lib/types';
import { Icon } from '../components/Icon';
import { RouteSheet, useSheetClose } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { BlurImage, Empty, ErrorCard, ListSkeleton, PageHead, Tabs, Tag } from '../components/ui';

const errText = (e: unknown) => (e instanceof ApiError ? e.message : '發生錯誤，請稍後再試。');

export function InboxTabs() {
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


/* ---------------------------------------------------------------- 申請 */
function ChangeCard({ c }: { c: ChangeRequest }) {
  const { mutation, undo } = useDecideChange();
  const toast = useToast();
  const approve = () => mutation.mutate({ id: c.id, approve: true }, {
    onSuccess: () => toast({ text: `已同意 ${c.studentName} 改到 ${fmtSlot(c.toDate, c.toTime)}`, undo: () => undo(c.id) }),
    onError: (e) => toast({ text: errText(e), kind: 'error' }),
  });
  return (
    <article className="card">
      <div className="name" style={{ fontSize: 18 }}>{c.studentName}</div>
      <div><span className="strike">{fmtSlot(c.fromDate, c.fromTime)}</span> <Icon name="arrow" size={14} /> <b className="hero-num" style={{ fontSize: 18 }}>{fmtSlot(c.toDate, c.toTime)}</b></div>
      {c.reason && <p>「{c.reason}」</p>}
      {c.slotFree ? <Tag tone="ok">新時段可用</Tag> : <><Tag tone="bad">新時段已被預約</Tag><p className="reason">這個時段已有其他預約，無法同意。可以婉拒並提議其他時間。</p></>}
      <div className="row">
        <Link className="btn danger grow" to={`${c.id}/decline`}>婉拒</Link>
        <button className="btn primary wide" disabled={!c.slotFree || mutation.isPending} onClick={approve}>同意</button>
      </div>
    </article>
  );
}

function ProposalRow({ p }: { p: Proposal }) {
  const { withdraw } = useProposals();
  const toast = useToast();
  return (
    <div className="li" style={{ flexWrap: 'wrap' }}>
      <div className="grow"><div className="name" style={{ fontSize: 16 }}>{p.studentName}</div>
        <div className="cap"><span className="strike">{fmtSlot(p.fromDate, p.fromTime)}</span> → <b>{fmtSlot(p.toDate, p.toTime)}</b></div></div>
      {p.status === 'open' ? <><Tag tone="warn">等待學生回覆</Tag><button className="btn link" disabled={withdraw.isPending} onClick={() => withdraw.mutate(p.id, { onSuccess: () => toast({ text: '已收回提議' }) })}>收回</button></>
        : p.status === 'approved' ? <Tag tone="ok">學生已接受</Tag>
        : <><Tag tone="bad">學生不方便</Tag><Link className="btn link" to={`/teacher/students/${p.studentId}/propose/${p.lessonId}`}>再提議</Link></>}
    </div>
  );
}

type ReqTab = 'changes' | 'proposals' | 'applications';

export function RequestsPage() {
  const req = useRequests();
  const app = useDecideApplication();
  const toast = useToast();
  const [tab, setTab] = useState<ReqTab>('changes');
  const d = req.data;
  const open = d?.proposals.filter((p) => p.status === 'open').length ?? 0;

  return (
    <div className="page">
      <InboxTabs />
      <Tabs value={tab} onChange={setTab} options={[
        { value: 'changes', label: `改時間${d?.changes.length ? ` (${d.changes.length})` : ''}` },
        { value: 'proposals', label: `你的提議${open ? ` (${open})` : ''}` },
        { value: 'applications', label: `新學生${d?.applications.length ? ` (${d.applications.length})` : ''}` },
      ]} />
      {req.isPending ? <ListSkeleton /> : req.isError ? <ErrorCard error={req.error} retry={() => req.refetch()} /> : (
        <>
          {tab === 'changes' && (d!.changes.length ? <div className="stack">{d!.changes.map((c) => <ChangeCard key={c.id} c={c} />)}</div> : <Empty text="沒有等待回覆的改時間申請。" />)}
          {tab === 'proposals' && (d!.proposals.length ? <div className="list">{d!.proposals.map((p) => <ProposalRow key={p.id} p={p} />)}</div> : <Empty text="你還沒有提議過改時間。" />)}
          {tab === 'applications' && (d!.applications.length ? (
            <div className="stack">{d!.applications.map((a) => (
              <article key={a.id} className="card">
                <div className="name" style={{ fontSize: 18 }}>{a.name}</div>
                <div className="cap">{a.email ?? 'LINE 登入'} · 申請於 {fmtRelative(a.createdAt)}</div>
                <div className="row">
                  <button className="btn danger grow" onClick={() => app.mutation.mutate({ id: a.id, approve: false }, { onSuccess: () => toast({ text: `已婉拒 ${a.name}`, undo: () => app.undo(a.id) }) })}>婉拒</button>
                  <button className="btn primary wide" onClick={() => app.mutation.mutate({ id: a.id, approve: true }, { onSuccess: () => toast({ text: `${a.name} 已加入`, undo: () => app.undo(a.id) }) })}>確認</button>
                </div>
              </article>
            ))}</div>
          ) : <Empty text="沒有等待確認的新學生。" />)}
        </>
      )}
      <Outlet />
    </div>
  );
}

export function DeclineSheet() {
  const { id } = useParams();
  const req = useRequests();
  const { mutation, undo } = useDecideChange();
  const toast = useToast();
  const nav = useNavigate();
  const close = useSheetClose('/teacher/requests');
  const [msg, setMsg] = useState('');
  const c = req.data?.changes.find((x) => x.id === id);

  return (
    <RouteSheet title="婉拒改時間" parent="/teacher/requests">
      {!c ? <p className="sub">{req.isPending ? '載入中…' : '這筆申請已處理。'}</p> : (
        <>
          <p><b>{c.studentName}</b> 想改到 {fmtSlot(c.toDate, c.toTime)}。原本的時段會保留。</p>
          <div className="field"><label htmlFor="dm">給學生的話（選填）</label><textarea id="dm" className="textarea" maxLength={300} value={msg} onChange={(e) => setMsg(e.target.value)} /></div>
          <button className="btn primary block" onClick={() => nav(`/teacher/students/${c.studentId}/propose/${c.lessonId}`, { replace: true })}>婉拒並提議其他時間</button>
          <button className="btn danger block" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: c.id, approve: false, message: msg.trim() || undefined }, { onSuccess: () => { close(); toast({ text: `已婉拒 ${c.studentName}`, undo: () => undo(c.id) }); } })}>婉拒</button>
        </>
      )}
    </RouteSheet>
  );
}

/* ---------------------------------------------------------------- 付款 */
/** Receipt viewer: a native <dialog> gives the dimmed page, focus trap and Esc for free. */
function ReceiptModal({ p, onClose, children }: { p: Payment; onClose: () => void; children?: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="modal" aria-label={`${p.studentName} 的收據`} onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <div className="row between" style={{ padding: '12px 12px 0 20px' }}>
        <h2 className="h2">{p.studentName} · {p.packageSize} 堂 · {fmtMoney(p.amount)}</h2>
        <button className="iconbtn" aria-label="關閉" onClick={() => ref.current?.close()} style={{ boxShadow: 'none' }}><Icon name="x" /></button>
      </div>
      <div style={{ padding: 16 }}>
        <BlurImage src={p.receiptUrl} lqip={p.lqip} alt={`${p.studentName} 的轉帳收據`} className="receipt-wrap" />
      </div>
      {p.note && <p className="sub" style={{ padding: '0 20px' }}>「{p.note}」</p>}
      <div className="row" style={{ padding: 16 }}>{children}</div>
    </dialog>
  );
}

const PAY_TABS: { value: PaymentStatus; label: string }[] = [{ value: 'Pending', label: '待確認' }, { value: 'Confirmed', label: '已確認' }, { value: 'Rejected', label: '已退回' }];

function PaymentRow({ p }: { p: Payment }) {
  const [open, setOpen] = useState(false);
  const { mutation, undo } = useDecidePayment();
  const toast = useToast();
  const nav = useNavigate();
  const key = useRef(newIdempotencyKey());
  const confirm = () => mutation.mutate({ id: p.id, confirm: true, key: key.current }, {
    onSuccess: () => { setOpen(false); toast({ text: `已確認，${p.studentName} 加 ${p.packageSize} 堂`, undo: () => undo(p.id) }); },
    onError: (e) => toast({ text: errText(e), kind: 'error' }),
  });
  return (
    <article className="card">
      <div className="row between"><div className="name" style={{ fontSize: 18 }}>{p.studentName}</div>
        {p.status === 'Pending' ? <Tag tone="pending">確認中</Tag> : p.status === 'Confirmed' ? <Tag tone="ok">已確認</Tag> : <Tag tone="bad">已退回</Tag>}</div>
      <div className="sub">{p.trial ? '體驗課 · ' : ''}{p.packageSize} 堂 · {fmtMoney(p.amount)} · {fmtRelative(p.uploadedAt)}</div>
      {p.note && <p>「{p.note}」</p>}
      {p.rejectReason && <p className="sub">退回原因：「{p.rejectReason}」</p>}
      <button className="btn secondary sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}><Icon name="image" size={18} />查看收據</button>
      {open && (
        <ReceiptModal p={p} onClose={() => setOpen(false)}>
          {p.status === 'Pending' && (
            <>
              <button className="btn danger grow" onClick={() => { setOpen(false); nav(`${p.id}/reject`); }}>退回</button>
              <button className="btn primary wide" disabled={mutation.isPending} onClick={confirm}>確認，加 {p.packageSize} 堂</button>
            </>
          )}
        </ReceiptModal>
      )}
    </article>
  );
}

export function PaymentsPage() {
  const [tab, setTab] = useState<PaymentStatus>('Pending');
  const pays = usePayments(tab);
  return (
    <div className="page">
      <InboxTabs />
      <Tabs value={tab} onChange={setTab} options={PAY_TABS} />
      {pays.isPending ? <ListSkeleton /> : pays.isError ? <ErrorCard error={pays.error} retry={() => pays.refetch()} /> : !pays.data.length ? <Empty text={tab === 'Pending' ? '沒有等待確認的收據。' : '這裡還沒有紀錄。'} />
        : <div className="stack">{pays.data.map((p) => <PaymentRow key={p.id} p={p} />)}</div>}
      <Outlet />
    </div>
  );
}

export function RejectSheet() {
  const { id } = useParams();
  const pays = usePayments('Pending');
  const { mutation, undo } = useDecidePayment();
  const toast = useToast();
  const close = useSheetClose('/teacher/payments');
  const key = useRef(newIdempotencyKey());
  const [reason, setReason] = useState('');
  const p = pays.data?.find((x) => x.id === id);

  return (
    <RouteSheet title="退回收據" parent="/teacher/payments">
      {!p ? <p className="sub">{pays.isPending ? '載入中…' : '這張收據已處理。'}</p> : (
        <>
          <p><b>{p.studentName}</b> · {p.packageSize} 堂 · {fmtMoney(p.amount)}</p>
          <div className="field"><label htmlFor="rr">退回原因（必填）</label><textarea id="rr" className="textarea" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：金額不符、圖片看不清楚" /></div>
          <button className="btn danger block" disabled={!reason.trim() || mutation.isPending}
            onClick={() => mutation.mutate({ id: p.id, confirm: false, reason: reason.trim(), key: key.current }, { onSuccess: () => { close(); toast({ text: `已退回 ${p.studentName} 的收據`, undo: () => undo(p.id) }); }, onError: (e) => toast({ text: errText(e), kind: 'error' }) })}>
            {reason.trim() ? '退回' : '請填寫原因'}
          </button>
        </>
      )}
    </RouteSheet>
  );
}
