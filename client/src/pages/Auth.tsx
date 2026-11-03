import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { qk, useLogout, useMe } from '../lib/queries';
import type { Me } from '../lib/types';

const MOCK = import.meta.env.MODE === 'mock';
const home = (me: Me) => (me.role === 'Teacher' ? '/teacher' : me.status === 'Pending' ? '/pending' : '/app');

export function Login() {
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const err = new URLSearchParams(useLocation().search).get('error');

  if (me.data) return <Navigate to={home(me.data)} replace />;

  // Re-read /api/me after signing in so every page gets the full, fresh profile (not just the login reply).
  const done = async () => {
    const u = await qc.fetchQuery({ queryKey: qk.me, queryFn: () => api.get<Me | null>('/api/me'), staleTime: 0 });
    if (u) nav(loc.state?.from ?? home(u), { replace: true, viewTransition: true });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api.post('/api/auth/login', { email, password }); await done(); }
    catch (x) { setError((x as Error).message); }
    finally { setBusy(false); }
  };
  const mockLine = async (as: string) => { setBusy(true); try { await api.post('/api/auth/line/mock', { as }); await done(); } finally { setBusy(false); } };

  return (
    <div className="auth">
      <div className="card">
        <div className="stack g1" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit', letterSpacing: '.24em', fontSize: 20 }}>IRIS</Link>
          <p className="overline">聲樂工作室</p>
        </div>
        <div className="stack g1"><h1 className="h2">歡迎回來</h1><p className="caption">用你的 LINE 帳號一鍵登入，不用另外記密碼。</p></div>
        {err && <div className="notice error" role="alert"><Icon name="info" /><span>LINE 登入沒有完成，請再試一次。</span></div>}
        {MOCK ? (
          <div className="stack g2">
            <p className="caption">示範模式：選一個帳號模擬 LINE 登入</p>
            <button className="btn line-login block" disabled={busy} onClick={() => mockLine('s1')}><Icon name="msg" />使用 LINE 登入（學生 王小明）</button>
            <button className="btn secondary block" disabled={busy} onClick={() => mockLine('s6')}>新學生（等待確認）</button>
            <button className="btn secondary block" disabled={busy} onClick={() => mockLine('t1')}>老師 Iris</button>
          </div>
        ) : (
          // Real LINE Login is an OAuth redirect handled by the server, so it's a plain link, not fetch.
          <a className="btn line-login block" href={`/api/auth/line?returnUrl=${encodeURIComponent(loc.state?.from ?? '')}`}><Icon name="msg" />使用 LINE 登入</a>
        )}
        {!showEmail ? <button className="btn secondary block" onClick={() => setShowEmail(true)}>使用 Email 登入</button> : (
          <form className="stack g4" onSubmit={submit}>
            <div className="field"><label htmlFor="em">Email</label><input id="em" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label htmlFor="pw">密碼</label><input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {error && <div className="notice error" role="alert"><Icon name="info" /><span>{error}</span></div>}
            <button className="btn primary block" disabled={busy}>{busy ? '登入中…' : '登入'}</button>
          </form>
        )}
        <p className="caption">第一次登入後，Iris 老師確認你的帳號，就可以開始預約課程。</p>
      </div>
    </div>
  );
}

export function Pending() {
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const logout = useLogout();
  // check every 10 s; as soon as Iris approves, go straight in (no re-login)
  useEffect(() => {
    const t = window.setInterval(() => qc.invalidateQueries({ queryKey: qk.me }), 10_000);
    return () => window.clearInterval(t);
  }, [qc]);
  if (me.isPending) return null;
  if (!me.data) return <Navigate to="/login" replace />;
  if (me.data.status === 'Active') return <Navigate to={home(me.data)} replace />;
  return (
    <div className="auth">
      <div className="card" style={{ alignItems: 'center', textAlign: 'center' }}>
        <span className="ico" style={{ width: 64, height: 64 }}><Icon name="clock" size={28} /></span>
        <div className="stack g1"><h1 className="h2">等待 Iris 老師確認</h1><p className="caption">你好，{me.data.name}。帳號已建立，老師確認後就可以開始預約。</p></div>
        <span className="tag warn">確認中</span>
        <hr className="line" style={{ width: '100%' }} />
        <div className="stack g1" style={{ textAlign: 'left', width: '100%' }}><p className="overline">接下來</p><p style={{ margin: 0 }}>1. 老師確認帳號（通常 1 天內）<br />2. 上傳匯款證明購買堂數<br />3. 選時間預約第一堂課</p></div>
        <button className="btn ghost" onClick={() => logout.mutate(undefined, { onSuccess: () => nav('/') })}>登出</button>
      </div>
    </div>
  );
}
