import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { newIdempotencyKey } from '../lib/api';
import { compareSlot, CONSULT_TIME_LABEL, fmtMoney, fmtRelative, fmtSlot, initialOf, studioNowTime, studioToday } from '../lib/date';
import {
  useConsults, useDecideApplication, useDecideChange, useDecidePayment, useDecideReport, useMarkContacted, useOverview, usePayments, useProposals,
  useRequests, useResendConsultConfirmation, useScheduleConsult, useStudio,
} from '../lib/queries';
import type { Consult, Payment, PaymentStatus, Proposal } from '../lib/types';
import { Icon } from '../components/Icon';
import { RouteSheet, useSheetClose } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { BlurImage, ErrorCard, ListSkeleton, PageHead, PageSkeleton, Tag } from '../components/ui';

const errText = (e: unknown) => (e instanceof Error ? e.message : '發生錯誤，請稍後再試。');

/** 收件匣 header + 申請 · 付款 · 諮詢 tabs, each with the number Iris must act on. */
export function InboxTabs() {
  const counts = useOverview().data?.counts;
  const { pathname } = useLocation();
  const tabs = [
    { to: '/teacher/requests', label: '申請', n: counts ? counts.changes + (counts.reports ?? 0) + counts.applications : 0 },
    { to: '/teacher/payments', label: '付款', n: counts?.receipts ?? 0 },
    { to: '/teacher/consults', label: '諮詢', n: counts?.consults ?? 0 },
  ];
  return (
    <>
      <PageHead title="收件匣" />
      <nav className="ibx-tabs" aria-label="收件匣">
        {tabs.map((t) => {
          const on = pathname.startsWith(t.to);
          return (
            <Link key={t.to} to={t.to} replace viewTransition aria-current={on ? 'page' : undefined} className={on ? 'on' : undefined}>
              {t.label}{t.n > 0 && <span className="ibx-n" aria-label={`${t.n} 件待處理`}>{t.n}</span>}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

/** /teacher/inbox: open the tab that has work waiting (申請 → 付款 → 諮詢), else 申請. */
export function InboxIndex() {
  const overview = useOverview();
  const c = overview.data?.counts;
  if (overview.isPending) return <PageSkeleton />;
  const to = !c || c.changes + (c.reports ?? 0) + c.applications ? '/teacher/requests' : c.receipts ? '/teacher/payments' : c.consults ? '/teacher/consults' : '/teacher/requests';
  return <Navigate to={to} replace />;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="ibx-empty">
      <span className="ibx-empty-ic" aria-hidden="true"><Icon name="check" size={18} weight="bold" /></span>
      <div><p className="ibx-empty-t">{title}</p><p className="ibx-empty-s">{text}</p></div>
    </div>
  );
}

/* ---------- 申請: 改時間 · 回報 · 新學生 · 等學生回覆 ---------- */

type RequestTab = 'changes' | 'reports' | 'apps' | 'waiting';
const TAB_LABEL: Record<RequestTab, string> = { changes: '改時間', reports: '回報', apps: '新學生', waiting: '等待學生回覆' };

export function RequestsPage() {
  const requests = useRequests();
  const decideChange = useDecideChange();
  const decideApp = useDecideApplication();
  const decideReport = useDecideReport();
  const { withdraw } = useProposals();
  const toast = useToast();
  const cancelFee = useStudio().data?.cancelFee ?? 500;
  const [params, setParams] = useSearchParams();
  const [waived, setWaived] = useState<Record<string, boolean>>({});
  const changes = requests.data?.changes ?? [];
  const apps = requests.data?.applications ?? [];
  const reports = requests.data?.reports ?? [];
  const proposals = requests.data?.proposals ?? [];
  const openProposals = proposals.filter((p) => p.status === 'open');
  const answered = proposals.filter((p) => p.status !== 'open');
  const q = params.get('tab');
  const tab: RequestTab = q === 'apps' || q === 'waiting' || q === 'reports' ? q : 'changes';
  const setTab = (t: RequestTab) => setParams(t === 'changes' ? {} : { tab: t }, { replace: true });
  const fail = (e: Error) => toast({ text: e.message, kind: 'error' });

  const proposalRow = (p: Proposal) => (
    <li className="rq-prow" key={p.id}>
      <div className="rq-pbody">
        <p className="rq-pname">{p.studentName}</p>
        <p className="rq-ptime">{fmtSlot(p.fromDate, p.fromTime)} <span aria-hidden="true">→</span><span className="sr-only">改到</span> <b>{fmtSlot(p.toDate, p.toTime)}</b></p>
        <p className={`rq-status ${p.status === 'open' ? 'wait' : p.status === 'approved' ? 'ok' : 'bad'}`}>
          {p.status === 'open' ? `◆ 已傳送 ${fmtRelative(p.createdAt)}` : p.status === 'approved' ? '● 學生已接受，已改時間' : '✕ 學生不方便，維持原時間'}
        </p>
      </div>
      {p.status === 'open'
        ? <button className="rq-btn rq-decline" disabled={withdraw.isPending} onClick={() => withdraw.mutateAsync(p.id).then(() => toast({ text: '已收回提議' })).catch(fail)}>收回</button>
        : p.status === 'declined' && <Link to={`/teacher/students/${p.studentId}/propose/${p.lessonId}`} className="rq-btn rq-decline">再提議</Link>}
    </li>
  );

  return (
    <>
      <InboxTabs />
      {requests.isPending ? <ListSkeleton rows={2} /> : requests.isError ? <ErrorCard error={requests.error} retry={requests.refetch} /> : (
        <>
          <div className="seg rq-seg rq-sub3" role="tablist" aria-label="申請類型">
            <button role="tab" aria-selected={tab === 'changes'} onClick={() => setTab('changes')}>改時間{changes.length > 0 && <span className="ibx-n">{changes.length}</span>}</button>
            <button role="tab" aria-selected={tab === 'reports'} onClick={() => setTab('reports')}>回報{reports.length > 0 && <span className="ibx-n">{reports.length}</span>}</button>
            <button role="tab" aria-selected={tab === 'apps'} onClick={() => setTab('apps')}>新學生{apps.length > 0 && <span className="ibx-n">{apps.length}</span>}</button>
            <button role="tab" aria-selected={tab === 'waiting'} onClick={() => setTab('waiting')}>等學生回覆{openProposals.length > 0 && <span className="rq-shn">{openProposals.length}</span>}</button>
          </div>
          <section className="rq-sec" role="tabpanel" aria-label={TAB_LABEL[tab]}>
            {tab === 'changes' && (changes.length ? (
              <div className="rq-group"><div className="rq-list">
                {changes.map((c) => (
                  <article key={c.id} className={`rq${c.slotFree ? '' : ' is-conflict'}`} aria-labelledby={`rq-${c.id}`}>
                    <header className="rq-who">
                      <span className="avatar rq-avatar" aria-hidden="true">{initialOf(c.studentName)}</span>
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
                        <button className="rq-btn rq-approve" disabled={!c.slotFree || decideChange.mutation.isPending} aria-describedby={c.slotFree ? undefined : `rq-why-${c.id}`}
                          onClick={() => decideChange.mutation.mutate({ id: c.id, approve: true }, {
                            onSuccess: () => toast({ text: `已同意，10 秒後通知${c.studentName}`, undo: () => decideChange.undo(c.id) }), onError: fail,
                          })}>同意</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div></div>
            ) : <EmptyState title="沒有待處理的改時間申請" text="學生申請改時間時，會出現在這裡。" />)}

            {tab === 'reports' && (reports.length ? (
              <div className="rq-group"><div className="rq-list">
                {reports.map((r) => {
                  const waive = !!waived[r.id];
                  return (
                    <article key={r.id} className="rq" aria-labelledby={`rp-${r.id}`}>
                      <header className="rq-who">
                        <span className="avatar rq-avatar" aria-hidden="true">{initialOf(r.studentName)}</span>
                        <div className="rq-who-text">
                          <h4 className="rq-name" id={`rp-${r.id}`}>{r.studentName}</h4>
                          <p className="rq-sub">{fmtRelative(r.createdAt)} 回報 · 想取消已上過的課</p>
                        </div>
                      </header>
                      <p className="rq-time"><span className="rq-new"><span className="sr-only">課程 </span>{fmtSlot(r.date, r.time)}</span><span className="rq-sub">（已記為已上課）</span></p>
                      {r.reason && <p className="rq-reason">「{r.reason}」</p>}
                      <p className="rp-effect">同意：<b>退回 1 堂</b>{waive ? '，不收取消費' : <>，下次繳費加收取消費 <b>{fmtMoney(cancelFee)}</b></>}</p>
                      <label className="rp-waive">
                        <input type="checkbox" checked={waive} onChange={(e) => setWaived((w) => ({ ...w, [r.id]: e.target.checked }))} />這次免收取消費
                      </label>
                      <div className="rq-foot">
                        <p className="rq-status wait">◆ 待審核</p>
                        <div className="rq-actions">
                          <Link to={`reports/${r.id}/decline`} className="rq-btn rq-decline">婉拒</Link>
                          <button className="rq-btn rq-approve" disabled={decideReport.mutation.isPending}
                            onClick={() => decideReport.mutation.mutate({ id: r.id, approve: true, waiveFee: waive, key: newIdempotencyKey() }, {
                              onSuccess: () => toast({ text: `已同意，退回 1 堂${waive ? '' : `，取消費 ${fmtMoney(cancelFee)}`} · 10 秒後通知${r.studentName}`, undo: () => decideReport.undo(r.id) }),
                              onError: fail,
                            })}>同意</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div></div>
            ) : <EmptyState title="沒有待審核的回報" text="學生回報沒上到的課時，會在這裡等你確認。" />)}

            {tab === 'apps' && (apps.length ? (
              <div className="rq-group" id="rq-apps"><div className="rq-list">
                {apps.map((a) => (
                  <article key={a.id} className="rq" aria-labelledby={`ap-${a.id}`}>
                    <header className="rq-who">
                      <span className="avatar rq-avatar" aria-hidden="true">{initialOf(a.name)}</span>
                      <div className="rq-who-text">
                        <h4 className="rq-name" id={`ap-${a.id}`}>{a.name}</h4>
                        <p className="rq-sub">{fmtRelative(a.createdAt)} 申請 · {a.email ? a.email : '使用 LINE 註冊'}</p>
                      </div>
                    </header>
                    <div className="rq-foot">
                      <p className="rq-status wait">● 等待你確認帳號</p>
                      <div className="rq-actions">
                        <button className="rq-btn rq-decline" disabled={decideApp.mutation.isPending} onClick={() => decideApp.mutation.mutate({ id: a.id, approve: false }, {
                          onSuccess: () => toast({ text: `已婉拒${a.name}`, undo: () => decideApp.undo(a.id) }), onError: fail,
                        })}>婉拒</button>
                        <button className="rq-btn rq-approve" disabled={decideApp.mutation.isPending} onClick={() => decideApp.mutation.mutate({ id: a.id, approve: true }, {
                          onSuccess: () => toast({ text: `已確認${a.name}的帳號`, undo: () => decideApp.undo(a.id) }), onError: fail,
                        })}>確認</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div></div>
            ) : <EmptyState title="沒有新的學生申請" text="有人註冊帳號後，會在這裡等你確認。" />)}

            {tab === 'waiting' && (
              <div className="rq-props">
                {openProposals.length ? <ul className="rq-plist">{openProposals.map(proposalRow)}</ul>
                  : <EmptyState title="目前沒有等待學生回覆的提議" text="你提議新時間後，會在這裡等學生回覆。" />}
                {answered.length > 0 && (
                  <details className="rq-recent"><summary>最近 7 天的回覆 · {answered.length}</summary><ul className="rq-plist">{answered.map(proposalRow)}</ul></details>
                )}
              </div>
            )}
          </section>
        </>
      )}
      <Outlet />
    </>
  );
}

/** 婉拒 a 改時間 request (optional message), or turn it into a counter-proposal. */
export function DeclineSheet() {
  const { id } = useParams();
  const requests = useRequests();
  const { mutation, undo } = useDecideChange();
  const toast = useToast();
  const navigate = useNavigate();
  const close = useSheetClose("/teacher/requests");
  const [message, setMessage] = useState('');
  const c = requests.data?.changes.find((x) => x.id === id);
  if (!c) return null;
  return (
    <RouteSheet title={`婉拒${c.studentName}的申請`} parent="/teacher/requests" dismissible={!mutation.isPending}>
      <div className="inner row">
        <div className="grow stack g1"><p className="caption">原時段（保留）</p><p className="t">{fmtSlot(c.fromDate, c.fromTime)}</p></div>
        <Icon name="arrow" />
        <div className="grow stack g1"><p className="caption">申請時段</p><p className="t">{fmtSlot(c.toDate, c.toTime)}</p></div>
      </div>
      <div className="field">
        <label htmlFor="dm">給學生的訊息（選填）</label>
        <textarea id="dm" className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="例如：那天的 16:30 可以嗎？" />
      </div>
      <button className="btn danger block" disabled={mutation.isPending} onClick={() => {
        const name = c.studentName;
        mutation.mutate({ id: c.id, approve: false, message });
        navigate('/teacher/requests', { replace: true });
        toast({ text: `已婉拒，10 秒後通知${name}`, undo: () => undo(c.id) });
      }}>婉拒並通知學生</button>
      <Link to={`/teacher/students/${c.studentId}/propose/${c.lessonId}`} replace className="btn secondary block"><Icon name="reschedule" size={18} />婉拒並提議其他時間</Link>
      <button className="btn secondary block" onClick={() => close()}>返回</button>
    </RouteSheet>
  );
}

/** 婉拒 a 回報: the reason is required (the student sees it); the lesson stays 已上課. */
export function ReportDeclineSheet() {
  const { id } = useParams();
  const requests = useRequests();
  const { mutation, undo } = useDecideReport();
  const toast = useToast();
  const navigate = useNavigate();
  const close = useSheetClose("/teacher/requests?tab=reports");
  const [message, setMessage] = useState('');
  const [key] = useState(newIdempotencyKey);
  const r = requests.data?.reports.find((x) => x.id === id);
  if (!r) return null;
  return (
    <RouteSheet title={`婉拒${r.studentName}的回報`} parent="/teacher/requests?tab=reports" dismissible={!mutation.isPending}>
      <div className="inner stack g1">
        <p className="caption">課程（維持已上課，不退堂數）</p>
        <p className="t">{fmtSlot(r.date, r.time)}</p>
        {r.reason && <p className="caption">學生：「{r.reason}」</p>}
      </div>
      <div className="field">
        <label htmlFor="rpm">婉拒原因（學生會看到）</label>
        <textarea id="rpm" className="input" required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="例如：那天你有來上課喔，有問題再跟我說。" />
      </div>
      <button className="btn danger block" disabled={!message.trim() || mutation.isPending} onClick={() => {
        const name = r.studentName;
        mutation.mutate({ id: r.id, approve: false, message, key });
        navigate('/teacher/requests?tab=reports', { replace: true });
        toast({ text: `已婉拒，10 秒後通知${name}`, undo: () => undo(r.id) });
      }}>婉拒並通知學生</button>
      <button className="btn secondary block" onClick={() => close()}>返回</button>
    </RouteSheet>
  );
}

/* ---------- 付款 ---------- */

const PAY_EMPTY: Record<PaymentStatus, { title: string; text: string }> = {
  Pending: { title: '沒有等待確認的收據', text: '學生上傳匯款證明後，會出現在這裡。' },
  Confirmed: { title: '還沒有已確認的收據', text: '確認過的收據會留在這裡，方便之後查帳。' },
  Rejected: { title: '沒有退回的收據', text: '退回的收據和原因會出現在這裡。' },
};
const PayTag = ({ s }: { s: PaymentStatus }) => <Tag tone={s === 'Confirmed' ? 'ok' : s === 'Rejected' ? 'bad' : 'warn'}>{{ Confirmed: '已確認', Rejected: '已退回', Pending: '待確認' }[s]}</Tag>;

export function PaymentsPage() {
  const [status, setStatus] = useState<PaymentStatus>('Pending');
  const payments = usePayments(status);
  const total = (payments.data ?? []).reduce((s, p) => s + p.amount, 0);
  return (
    <>
      <InboxTabs />
      <div className="seg rq-seg" role="tablist" aria-label="收據狀態">
        {(['Pending', 'Confirmed', 'Rejected'] as const).map((s) => (
          <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}>{{ Pending: '待確認', Confirmed: '已確認', Rejected: '已退回' }[s]}</button>
        ))}
      </div>
      {status === 'Pending' && payments.data && <p className="caption rq-summary">待確認 {payments.data.length} 筆 · 共 {fmtMoney(total)}。確認後堂數會自動加到學生帳號。</p>}
      {payments.isPending ? <ListSkeleton rows={2} /> : payments.isError ? <ErrorCard error={payments.error} retry={payments.refetch} />
        : payments.data.length === 0 ? <EmptyState {...PAY_EMPTY[status]} />
        : <div className="rq-list">{payments.data.map((p) => <PaymentCard key={p.id} p={p} />)}</div>}
      <Outlet />
    </>
  );
}

function PaymentCard({ p }: { p: Payment }) {
  const { mutation, undo } = useDecidePayment();
  const toast = useToast();
  const [key] = useState(newIdempotencyKey);
  const [viewing, setViewing] = useState(false);
  const [sent, setSent] = useState(false);
  const pending = p.status === 'Pending';
  const confirm = () => {
    if (sent) return;
    setSent(true);
    mutation.mutateAsync({ id: p.id, confirm: true, key })
      .then(() => toast({ text: `已確認，${p.studentName} +${p.packageSize} 堂`, undo: () => undo(p.id) }))
      .catch((e: Error) => { setSent(false); toast({ text: e.message, kind: 'error' }); });
  };
  return (
    <article className="rq" aria-labelledby={`pay-${p.id}`}>
      <header className="rq-who">
        <button className="rq-thumb" aria-label={`查看 ${p.studentName} 的收據`} aria-haspopup="dialog" onClick={() => setViewing(true)}><Icon name="image" size={20} /></button>
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
            <button className="rq-btn rq-approve" aria-haspopup="dialog" onClick={() => setViewing(true)}>查看收據並確認</button>
          </div>
        </div>
      ) : <button className="rq-link" aria-haspopup="dialog" onClick={() => setViewing(true)}>查看收據</button>}
      {viewing && <ReceiptModal p={p} onClose={() => setViewing(false)} onConfirm={pending ? () => { setViewing(false); confirm(); } : undefined} busy={sent || mutation.isPending} />}
    </article>
  );
}

/** Receipt + expected amount (方案 + 取消費 line by line). Credits only after ticking 我已核對. */
function ReceiptModal({ p, onClose, onConfirm, busy }: { p: Payment; onClose: () => void; onConfirm?: () => void; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    d.showModal();
    const y = window.scrollY;
    document.documentElement.classList.add('modal-open');
    return () => { document.documentElement.classList.remove('modal-open'); window.scrollTo(0, y); };
  }, []);
  const close = () => ref.current?.close();
  return (
    <dialog ref={ref} className="rcpt" aria-labelledby={`rcpt-t-${p.id}`} onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="rcpt-box">
        <header className="rcpt-head">
          <div>
            <h2 id={`rcpt-t-${p.id}`}>{p.studentName} 的收據</h2>
            <p>{p.packageSize} 堂 · {fmtMoney(p.amount)} · {fmtRelative(p.uploadedAt)} 上傳</p>
            {p.feeAmount > 0 && <p className="rcpt-fees">= 方案 {fmtMoney(p.packageAmount)} + 取消費 {fmtMoney(p.feeAmount)}</p>}
          </div>
          <button className="rcpt-x" aria-label="關閉" onClick={close}><Icon name="x" size={20} /></button>
        </header>
        <div className="rcpt-img">
          {p.receiptUrl
            ? <BlurImage src={p.receiptUrl} lqip={p.lqip} alt={`${p.studentName} 上傳的轉帳截圖`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <div className="rcpt-none"><Icon name="image" size={40} /><span>（示範資料沒有圖片）</span></div>}
        </div>
        {p.note && <p className="rcpt-note">「{p.note}」</p>}
        {onConfirm && (
          <>
            <label className="rcpt-check">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              <span>我已核對：金額 <b>{fmtMoney(p.amount)}</b>{p.note ? `，備註「${p.note}」` : ''}，和收到的匯款一致</span>
            </label>
            <div className="rcpt-actions">
              <Link to={`${p.id}/reject`} className="rq-btn rq-decline" onClick={close}>退回</Link>
              <button className="rq-btn rq-approve" disabled={!checked || busy} aria-describedby={checked ? undefined : `rcpt-hint-${p.id}`} onClick={onConfirm}>
                {busy ? '確認中…' : `確認，加 ${p.packageSize} 堂`}
              </button>
            </div>
            {!checked && <p className="rcpt-hint" id={`rcpt-hint-${p.id}`}>請先勾選核對，再加堂數給{p.studentName}。</p>}
          </>
        )}
      </div>
    </dialog>
  );
}

export function RejectSheet() {
  const { id } = useParams();
  const payments = usePayments('Pending');
  const { mutation, undo } = useDecidePayment();
  const toast = useToast();
  const navigate = useNavigate();
  const close = useSheetClose("/teacher/payments");
  const [reason, setReason] = useState('');
  const [key] = useState(newIdempotencyKey);
  const p = payments.data?.find((x) => x.id === id);
  if (!p) return null;
  return (
    <RouteSheet title={`退回${p.studentName}的收據`} parent="/teacher/payments" dismissible={!mutation.isPending}>
      <div className="inner stack g1"><p className="t">{p.packageSize} 堂 · {fmtMoney(p.amount)}</p><p className="caption">{fmtRelative(p.uploadedAt)} 上傳</p></div>
      <div className="field">
        <label htmlFor="rr">退回原因（學生會看到）</label>
        <textarea id="rr" className="input" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：金額不符，請確認轉帳金額。" />
      </div>
      <button className="btn danger block" disabled={!reason.trim()} onClick={() => {
        mutation.mutate({ id: p.id, confirm: false, reason, key });
        navigate('/teacher/payments', { replace: true });
        toast({ text: '已退回，10 秒後通知學生', undo: () => undo(p.id) });
      }}>退回並通知學生</button>
      <button className="btn secondary block" onClick={() => close()}>返回</button>
    </RouteSheet>
  );
}

/* ---------- 諮詢 ---------- */

export function ConsultsPage() {
  const consults = useConsults();
  const mark = useMarkContacted();
  const resend = useResendConsultConfirmation();
  const toast = useToast();
  const [scheduling, setScheduling] = useState<string | null>(null);
  const now = { date: studioToday(), time: studioNowTime() };
  return (
    <>
      <InboxTabs />
      <p className="caption">來自網站的免費諮詢表單</p>
      {consults.isPending ? <ListSkeleton rows={2} /> : consults.isError ? <ErrorCard error={consults.error} retry={consults.refetch} /> : (
        <section className="card tight">
          {consults.data.length === 0 ? <EmptyState title="目前沒有新的諮詢" text="網站上的「免費諮詢」表單送出後，會出現在這裡。" /> : (
            <div className="list">
              {[...consults.data].sort((a, b) => Number(a.contacted) - Number(b.contacted)).map((c) => (
                <div className="li col" key={c.id}>
                  <div className="row">
                    <span className="avatar">{initialOf(c.name)}</span>
                    <div className="grow stack g1">
                      <p className="t">{c.name}</p>
                      <p className="caption">{c.contactType === 'line' ? 'LINE' : 'Email'} {c.contact} · 方便：{CONSULT_TIME_LABEL[c.preferredTime]}</p>
                    </div>
                    <Tag tone={c.contacted ? 'grey' : 'warn'}>{c.contacted ? '已聯絡' : '待聯絡'}</Tag>
                  </div>
                  {c.topic && <p className="caption">「{c.topic}」</p>}
                  {c.scheduledDate && c.scheduledTime && (
                    <p className="caption"><Icon name="calendar" size={14} /> 諮詢時間：<b>{fmtSlot(c.scheduledDate, c.scheduledTime)}</b>{c.scheduleNote ? ` · ${c.scheduleNote}` : ''}</p>
                  )}
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                    {scheduling !== c.id && c.contactType === 'email' && c.scheduledDate && c.scheduledTime
                      && compareSlot({ date: c.scheduledDate, time: c.scheduledTime }, now) > 0 && (
                      <button className="btn sm secondary" disabled={resend.isPending} onClick={() => resend.mutate(c.id, {
                        onSuccess: () => toast({ text: `確認信已排入寄送，將寄到 ${c.contact}` }),
                        onError: (e) => toast({ text: errText(e), kind: 'error' }),
                      })}>{resend.isPending && resend.variables === c.id ? '寄送中…' : '重寄確認信'}</button>
                    )}
                    {scheduling !== c.id && <button className="btn sm secondary" onClick={() => setScheduling(c.id)}>{c.scheduledDate ? '改諮詢時間' : '安排諮詢時間'}</button>}
                    <button className="btn sm secondary" onClick={() => mark.mutate({ id: c.id, contacted: !c.contacted }, {
                      onSuccess: () => toast({ text: c.contacted ? '已標為待聯絡' : '已標為已聯絡', undo: async () => { await mark.mutateAsync({ id: c.id, contacted: c.contacted }); } }),
                    })}>{c.contacted ? '標為待聯絡' : '標為已聯絡'}</button>
                  </div>
                  {scheduling === c.id && <ScheduleConsultForm c={c} close={() => setScheduling(null)} />}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

/** 安排諮詢時間: saves the slot; an applicant who left an email gets the 諮詢時間確認 email. */
function ScheduleConsultForm({ c, close }: { c: Consult; close: () => void }) {
  const schedule = useScheduleConsult();
  const toast = useToast();
  const [f, setF] = useState({ date: c.scheduledDate ?? '', time: c.scheduledTime ?? '', note: c.scheduleNote ?? '' });
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(f.date) && /^\d{2}:\d{2}$/.test(f.time);
  const changed = f.date !== c.scheduledDate || f.time !== c.scheduledTime || f.note.trim() !== (c.scheduleNote ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    schedule.mutate({ id: c.id, ...f, note: f.note.trim() }, {
      onSuccess: () => { close(); toast({ text: !changed ? '已儲存，諮詢安排沒有變更' : c.contactType === 'email' ? `已安排，確認信會寄到 ${c.contact}` : '已安排，請透過 LINE 告知對方' }); },
      onError: (er) => toast({ text: errText(er), kind: 'error' }),
    });
  };
  return (
    <form className="stack g3" onSubmit={submit}>
      <div className="row" style={{ gap: 8 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`cs-d-${c.id}`}>日期</label>
          <input id={`cs-d-${c.id}`} className="input" type="date" required min={studioToday()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`cs-t-${c.id}`}>時間（台北）</label>
          <input id={`cs-t-${c.id}`} className="input" type="time" required step={900} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`cs-n-${c.id}`}>備註（選填）</label>
        <input id={`cs-n-${c.id}`} className="input" maxLength={200} aria-describedby={`cs-h-${c.id}`} placeholder="例如：https://meet.google.com/abc-defg-hij" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      <p id={`cs-h-${c.id}`} className="caption">
        {c.contactType === 'email' ? `新增或更改時間、備註後，會寄出「諮詢時間確認」到 ${c.contact}。填入 Google Meet 連結後，確認信會附上加入視訊按鈕。` : '對方留的是 LINE，系統不會自動通知，請自行傳訊息。'}
      </p>
      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn secondary sm" onClick={close}>取消</button>
        <button className="btn primary sm" disabled={!ok || schedule.isPending}>{schedule.isPending ? '儲存中…' : '儲存'}</button>
      </div>
    </form>
  );
}
