import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { qk, session, useLogout, useMe } from '../lib/queries';
import type { Me } from '../lib/types';

const MOCK = import.meta.env.MODE === 'mock' || import.meta.env.MODE === 'proto';
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

  const [mode, setMode] = useState<'student' | 'teacher'>('student');
  const openEmail = (m: 'student' | 'teacher') => { setMode(m); setShowEmail(true); setError(null); };
  // LINE stays a small brand mark; the button itself uses the IRIS sage
  const lineMark = <span className="li-mark" aria-hidden="true"><Icon name="msg" size={14} /></span>;

  return (
    <div className="auth au">
      <div className="au-card">
        <Link to="/" className="au-brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition><b>IRIS</b><span>聲樂工作室</span></Link>
        <div className="au-head">
          <h1 className="au-h1">{showEmail && mode === 'teacher' ? '老師登入' : '歡迎回來'}</h1>
          <p className="au-sub">{showEmail && mode === 'teacher' ? '用工作室的 Email 和密碼登入。' : '登入後就可以預約下一堂課'}</p>
        </div>
        {err && <div className="notice error" role="alert"><Icon name="info" /><span>LINE 登入沒有完成，請再試一次。</span></div>}

        {!showEmail ? (
          <div className="au-actions">
            {MOCK
              ? <button className="au-btn primary" disabled={busy} onClick={() => mockLine('s1')}>{lineMark}使用 LINE 登入</button>
              // Real LINE Login is an OAuth redirect handled by the server, so it's a plain link, not fetch.
              : <a className="au-btn primary" href={`/api/auth/line?returnUrl=${encodeURIComponent(loc.state?.from ?? '')}`}>{lineMark}使用 LINE 登入</a>}
            <button className="au-btn" onClick={() => openEmail('student')}>使用 Email 登入</button>
          </div>
        ) : (
          <form className="au-form" onSubmit={submit}>
            <div className="field"><label htmlFor="em">Email</label><input id="em" className="input" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label htmlFor="pw">密碼</label><input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {error && <div className="notice error" role="alert"><Icon name="info" /><span>{error}</span></div>}
            <button className="au-btn primary" disabled={busy}>{busy ? '登入中…' : '登入'}</button>
            <button type="button" className="au-text" onClick={() => setShowEmail(false)}>← 其他登入方式</button>
          </form>
        )}

        {!showEmail && <>
          <div className="au-divider"><span>其他登入方式</span></div>
          <button className="au-text" onClick={() => openEmail('teacher')}>老師登入 <span aria-hidden="true">→</span></button>
        </>}

        <p className="au-foot">第一次來 IRIS？<Link to="/register" viewTransition>建立帳號 <span aria-hidden="true">→</span></Link></p>
      </div>

      {/* demo accounts only exist in the mock/prototype build — never in production */}
      {MOCK && (
        <section className="au-demo" aria-labelledby="au-demo-h">
          <h2 id="au-demo-h">示範帳號</h2>
          <div>
            <button disabled={busy} onClick={() => mockLine('s1')}>學生 王小明</button>
            <button disabled={busy} onClick={() => mockLine('s6')}>新學生（等待確認）</button>
            <button disabled={busy} onClick={() => mockLine('t1')}>老師 Iris</button>
          </div>
        </section>
      )}
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
  if (!me.data) return <Navigate to={session.loggingOut ? '/' : '/login'} replace />;
  if (me.data.status === 'Active') return <Navigate to={home(me.data)} replace />;
  return (
    <div className="auth au">
      <div className="au-card">
        <Link to="/" className="au-brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition><b>IRIS</b><span>聲樂工作室</span></Link>
        <Journey step={1} />
        <div className="au-done">
          {/* not approved yet → a calm "in review" mark, not a success tick */}
          <span className="au-wait" aria-hidden="true"><Icon name="clock" size={24} /></span>
          <p className="au-kicker">申請已送出</p>
          <h1 className="au-h1">等待 Iris 確認</h1>
          <p className="au-sub">Iris 會親自確認你的帳號，通常會在 1 天內完成。確認後我們會通知你。</p>
        </div>
        <p className="au-next">確認後，就可以購買堂數並預約第一堂課。</p>
        <p className="au-switch">{/* space only before a Latin name: 不是 Chandra？ / 不是吳詠晴？ */}不是{/^[A-Za-z]/.test(me.data.name) ? ' ' : ''}{me.data.name}？<button className="au-inline" onClick={() => { nav('/login'); logout.mutate(); }}>切換帳號</button></p>
      </div>
    </div>
  );
}

/** 建立帳號 → Iris 確認 → 開始預約. `step` = index of the current step. */
function Journey({ step }: { step: 0 | 1 | 2 }) {
  const steps = ['建立帳號', 'Iris 確認', '開始預約'];
  return (
    <ol className="au-journey" aria-label="加入流程">
      {steps.map((t, i) => (
        <li key={t} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
          <span className="au-jdot" aria-hidden="true">{i < step ? <Icon name="check" size={12} weight="bold" /> : i + 1}</span>
          <span className="au-jt">{t}</span>
        </li>))}
    </ol>
  );
}

/**
 * /register: new students create an account (PRD AUTH-1). It starts as Pending until Iris approves it.
 * LINE is the main path (no password to remember); email + password is the fallback.
 */
export function Register() {
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (me.data) return <Navigate to={home(me.data)} replace />;

  const errs = {
    name: !f.name.trim() ? '請填寫姓名。' : '',
    email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()) ? '請填寫正確的 Email。' : '',
    password: f.password.length < 8 ? '密碼至少 8 個字元。' : '',
  };
  const invalid = Object.values(errs).some(Boolean);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const show = (k: keyof typeof errs) => (tried && errs[k] ? <p className="field-error" id={`${k}-err`}>{errs[k]}</p> : null);

  const finish = async () => {
    await qc.fetchQuery({ queryKey: qk.me, queryFn: () => api.get<Me | null>('/api/me'), staleTime: 0 });
    nav('/pending', { replace: true, viewTransition: true });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setTried(true); setError(null);
    if (invalid) return;
    setBusy(true);
    try { await api.post('/api/auth/register', { name: f.name.trim(), email: f.email.trim(), phone: null, password: f.password }); await finish(); }
    catch (x) { setError((x as Error).message); }
    finally { setBusy(false); }
  };
  const lineRegister = async () => { setBusy(true); try { await api.post('/api/auth/line/mock-register'); await finish(); } finally { setBusy(false); } };

  const lineMark = <span className="li-mark" aria-hidden="true"><Icon name="msg" size={14} /></span>;
  return (
    <div className="auth au">
      <div className="au-card">
        <Link to="/" className="au-brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition><b>IRIS</b><span>聲樂工作室</span></Link>
        <Journey step={0} />
        <div className="au-head">
          <h1 className="au-h1">建立你的帳號</h1>
          <p className="au-sub">用 LINE 最快，不用另外記密碼。</p>
        </div>
        {MOCK
          ? <button className="au-btn primary" disabled={busy} onClick={lineRegister}>{lineMark}使用 LINE 註冊</button>
          : <a className="au-btn primary" href="/api/auth/line?returnUrl=/pending">{lineMark}使用 LINE 註冊</a>}
        <div className="au-divider"><span>或使用 Email</span></div>
        <form className="au-form" onSubmit={submit} noValidate>
          <div className="field"><label htmlFor="rn">姓名</label><input id="rn" className="input" autoComplete="name" value={f.name} onChange={set('name')} aria-invalid={tried && !!errs.name} aria-describedby="name-err" />{show('name')}</div>
          <div className="field"><label htmlFor="re">Email</label><input id="re" className="input" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set('email')} aria-invalid={tried && !!errs.email} aria-describedby="email-err" />{show('email')}</div>
          <div className="field"><label htmlFor="rw">密碼</label>
            <div className="au-pw">
              <input id="rw" className="input" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={f.password} onChange={set('password')} aria-invalid={tried && !!errs.password} aria-describedby={tried && errs.password ? 'password-err' : 'pw-hint'} />
              <button type="button" className="au-eye" aria-label={showPw ? '隱藏密碼' : '顯示密碼'} aria-pressed={showPw} onClick={() => setShowPw(!showPw)}><Icon name={showPw ? 'eyeOff' : 'eye'} size={20} /></button>
            </div>
            {show('password') ?? <p className={`au-hint${f.password.length >= 8 ? ' ok' : ''}`} id="pw-hint">{f.password.length >= 8 ? '✓ ' : ''}至少 8 個字元</p>}</div>
          {error && <div className="notice error" role="alert"><Icon name="info" /><span>{error}</span></div>}
          <button className="au-btn primary" disabled={busy}>{busy ? '建立中…' : '建立帳號'}</button>
        </form>
        <p className="au-foot">已經有帳號？<Link to="/login" viewTransition>登入</Link></p>
      </div>
    </div>
  );
}
