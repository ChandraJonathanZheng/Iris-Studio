// Pages opened from links in emails: email verification and marketing unsubscribe (password reset lives in Auth.tsx).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { qk } from '../lib/queries';
import { AuthCard } from './Auth';

const errText = (e: unknown) => (e instanceof Error ? e.message : '發生錯誤，請稍後再試。');
const useLinkToken = (name = 'token') => new URLSearchParams(useLocation().search).get(name) ?? '';

function Card({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <AuthCard>
      <div className="au-head" role="status">
        <h1 className="au-h1">{title}</h1>
        <p className="au-sub">{sub}</p>
      </div>
      {children && <div className="au-form">{children}</div>}
    </AuthCard>
  );
}

/** /verify-email?token=… — confirms automatically on open (one request even under StrictMode). */
export function VerifyEmail() {
  const token = useLinkToken();
  const qc = useQueryClient();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(token ? null : { ok: false, text: '連結不完整，請從驗證信重新點開。' });
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api.post<{ email: string }>('/api/auth/verify-email', { token })
      .then((r) => { setResult({ ok: true, text: `${r.email} 已完成驗證。` }); qc.invalidateQueries({ queryKey: qk.me }); })
      .catch((e) => setResult({ ok: false, text: errText(e) }));
  }, [token, qc]);
  if (!result) return <Card title="驗證中…" sub="請稍候。" />;
  return (
    <Card title={result.ok ? 'Email 驗證完成' : '無法完成驗證'} sub={result.text}>
      {!result.ok && <p className="caption">登入後可以在「個人資料」重新寄送驗證信。</p>}
      <Link className="au-btn primary au-glow" to="/login">繼續</Link>
    </Card>
  );
}

/** /unsubscribe?t=… — from the footer of a marketing email. Asks first, so a link scanner can't unsubscribe someone. */
export function Unsubscribe() {
  const token = useLinkToken('t');
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'error'>(token ? 'ask' : 'error');
  const [error, setError] = useState('這個取消訂閱連結無效。');
  const go = async () => {
    setState('busy');
    try { await api.post(`/api/public/unsubscribe?t=${encodeURIComponent(token)}`); setState('done'); }
    catch (e) { setError(errText(e)); setState('error'); }
  };
  if (state === 'done') return (
    <Card title="已取消訂閱" sub="你不會再收到 IRIS Studio 的行銷訊息。預約、付款等服務通知不受影響。">
      <p className="caption">想重新訂閱，可以登入後到「個人資料 → 同意設定」開啟。</p>
      <Link className="au-btn" to="/">回到首頁</Link>
    </Card>
  );
  if (state === 'error') return <Card title="無法取消訂閱" sub={error}><Link className="au-btn" to="/">回到首頁</Link></Card>;
  return (
    <Card title="取消訂閱行銷訊息" sub="確認後，你將不再收到 IRIS Studio 的活動與優惠消息。預約與付款相關的通知仍會照常寄送。">
      <button className="au-btn primary au-glow" disabled={state === 'busy'} onClick={go}>{state === 'busy' ? '處理中…' : '確認取消訂閱'}</button>
      <Link className="au-link" to="/">先不要</Link>
    </Card>
  );
}
