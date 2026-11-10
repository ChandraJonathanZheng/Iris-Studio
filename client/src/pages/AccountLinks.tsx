import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { qk } from '../lib/queries';
import { Field, PasswordInput } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const errText = (e: unknown) => (e instanceof ApiError ? e.message : '發生錯誤，請稍後再試。');
const emailLogin = (email = '') => `/login?method=email${email ? `&email=${encodeURIComponent(email)}` : ''}`;

function Card({ title, sub, icon, children }: { title: string; sub?: ReactNode; icon?: IconName; children?: ReactNode }) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const previousTitle = useRef(title);
  useEffect(() => {
    if (previousTitle.current !== title) heading.current?.focus();
    previousTitle.current = title;
  }, [title]);
  return (
    <main className="auth" aria-labelledby={id}><div className="card account-card">
      <div className="stack s2"><Link to="/" className="over">IRIS STUDIO</Link>
        {icon && <span className="account-mark"><Icon name={icon} size={28} /></span>}
        <h1 className="h1 account-title" id={id} ref={heading} tabIndex={-1}>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
      {children}
    </div></main>
  );
}

/**
 * Links from emails carry a one-time token in the URL. Read it once, then drop it from the address bar,
 * so it doesn't stay in history or leak through a Referer header.
 */
function useLinkToken(param = 'token') {
  const [search] = useSearchParams();
  const [token] = useState(() => search.get(param) ?? '');
  useEffect(() => { if (token) window.history.replaceState(window.history.state, '', window.location.pathname); }, [token]);
  return token;
}

function useCooldown(until: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (until <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** Email/password accounts only. Unknown and LINE-only addresses get the same confirmation. */
export function ForgotPassword() {
  const [search] = useSearchParams();
  const emailInput = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(() => (search.get('email') ?? '').slice(0, 200));
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const remaining = useCooldown(cooldownUntil);
  const [error, setError] = useState('');
  const bad = !EMAIL_RE.test(email.trim());
  const request = async (address: string) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api.post('/api/auth/forgot-password', { email: address });
      setSentTo(address);
      setCooldownUntil(Date.now() + 120_000);
    } catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (bad) emailInput.current?.focus();
    else void request(email.trim());
  };
  if (sentTo !== null) return (
    <main className="auth pw-done-wrap" aria-labelledby="fp-sent-title"><div className="pw-done fp-sent">
      <p className="pw-done-brand">IRIS STUDIO</p>
      <span className="pw-done-rule" aria-hidden="true" />
      <span className="pw-done-mark" aria-hidden="true"><Icon name="mail" size={34} /></span>
      <h1 className="pw-done-title" id="fp-sent-title" tabIndex={-1} ref={(el) => el?.focus()}>請查看你的信箱</h1>
      <p className="pw-done-lead fp-lead">我們已寄出重設密碼的連結到<br /><b className="account-email">{sentTo}</b>。</p>
      <div className="fp-note">
        <Icon name="clock" size={26} />
        <div><p className="fp-note-t">連結在 60 分鐘內有效，且只能使用一次。</p>
          <p className="fp-note-s">沒收到信？請檢查垃圾郵件匣，或稍等幾分鐘再試。</p></div>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn primary pw-done-cta fp-cta" disabled={busy || remaining > 0} onClick={() => void request(sentTo)}>
        {busy ? '寄送中…' : remaining > 0 ? `重新寄送（${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}）` : '重新寄送連結'}
      </button>
      <p className="fp-hint">2 分鐘後可重新寄送；新的連結會取代舊的連結。</p>
      <div className="fp-actions">
        <button type="button" className="fp-link" onClick={() => { setSentTo(null); setTried(false); setError(''); }}>修改 Email</button>
        <Link className="fp-link" to={emailLogin(sentTo)}>回到登入<Icon name="arrow" size={18} /></Link>
      </div>
    </div></main>
  );
  return (
    <main className="auth pw-done-wrap" aria-labelledby="fp-title"><div className="pw-done login-card fp-card">
      <div className="login-head">
        <Link to="/" className="pw-done-brand">IRIS STUDIO</Link>
        <span className="pw-done-rule" aria-hidden="true" />
        <span className="pw-done-mark sq" aria-hidden="true"><Icon name="mail" size={30} /></span>
        <h1 className="pw-done-title" id="fp-title">忘記密碼？</h1>
        <p className="pw-done-lead fp-lead">輸入註冊時使用的 Email，我們會寄送設定新密碼的連結。</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate aria-busy={busy}>
        <Field id="fp-email" label="登入 Email" error={tried && bad ? '請填寫正確的 Email。' : undefined}>
          <input id="fp-email" ref={emailInput} className="input" type="email" autoComplete="email" inputMode="email" maxLength={200} autoFocus disabled={busy}
            value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={(tried && bad) || undefined} aria-describedby={tried && bad ? 'fp-email-err' : undefined} />
        </Field>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? '寄送中…' : '寄送重設連結'}</button>
      </form>
      <div className="fp-line">
        <p className="fp-note-t">平常用 LINE 登入？</p>
        <p className="fp-line-s">此功能只適用 Email 與密碼帳號。使用 LINE 建立的帳號，請直接用 LINE 登入。</p>
        <Link className="fp-line-go" to="/login">使用 LINE 登入<Icon name="arrow" size={18} /></Link>
      </div>
      <Link className="fp-back" to={emailLogin(email.trim())}><Icon name="arrow" size={18} />回到 Email 登入</Link>
    </div></main>
  );
}

/** /reset-password?token=… — sets a new password; every device has to sign in again afterwards. */
export function ResetPassword() {
  const token = useLinkToken();
  const qc = useQueryClient();
  const [password, setPassword] = useState(''); const [again, setAgain] = useState('');
  const [state, setState] = useState<'checking' | 'ready' | 'busy' | 'done' | 'invalid' | 'check-error'>(token ? 'checking' : 'invalid');
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const short = password.length < 8; const mismatch = again !== password;
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setError('');
    setState('checking');
    api.post('/api/auth/reset-password/validate', { token }, { signal: controller.signal })
      .then(() => { if (!controller.signal.aborted) setState('ready'); })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(errText(err));
        setState(err instanceof ApiError && err.code === 'invalid_token' ? 'invalid' : 'check-error');
      });
    return () => controller.abort();
  }, [token, checkAttempt]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (short || mismatch) { document.getElementById(short ? 'rp-pw' : 'rp-again')?.focus(); return; }
    if (state !== 'ready') return;
    setState('busy'); setError('');
    try {
      await api.post('/api/auth/reset-password', { token, password });
      qc.clear();
      qc.setQueryData(qk.me, null);
      setPassword(''); setAgain('');
      setState('done');
    } catch (err) {
      setError(errText(err));
      setState(err instanceof ApiError && err.code === 'invalid_token' ? 'invalid' : 'ready');
    }
  };
  if (state === 'checking') return <Card title="正在確認連結" icon="clock"><p className="sub" role="status">請稍候，我們正在確認這個連結是否有效。</p></Card>;
  if (state === 'check-error') return (
    <Card title="暫時無法確認連結" icon="info" sub="請檢查網路連線後再試一次。">
      <p className="err" role="alert">{error}</p>
      <button className="btn primary block" onClick={() => setCheckAttempt((n) => n + 1)}>重新確認</button>
      <Link className="btn link" to={emailLogin()}>回到登入</Link>
    </Card>
  );
  if (state === 'invalid') return (
    <main className="auth pw-done-wrap" aria-labelledby="pw-bad-title"><div className="pw-done">
      <p className="pw-done-brand">IRIS STUDIO</p>
      <span className="pw-done-rule" aria-hidden="true" />
      <span className="pw-done-mark sq" aria-hidden="true"><Icon name="clock" size={36} /></span>
      <h1 className="pw-done-title" id="pw-bad-title" tabIndex={-1} ref={(el) => el?.focus()}>{token ? '連結已失效' : '連結不完整'}</h1>
      <p className="pw-done-lead">連結可能已過期、使用過，或已被新的申請取代。<br />請重新申請，並使用最新一封信件中的連結。</p>
      <Link className="btn primary pw-done-cta" to="/forgot-password">重新申請重設連結</Link>
      <Link className="pw-done-alt" to={emailLogin()}>回到 Email 登入</Link>
    </div></main>
  );
  if (state === 'done') return (
    <main className="auth pw-done-wrap" aria-labelledby="pw-done-title"><div className="pw-done" role="status">
      <Link to="/" className="pw-done-back"><Icon name="back" size={18} />回首頁</Link>
      <p className="pw-done-brand">IRIS STUDIO</p>
      <span className="pw-done-rule" aria-hidden="true" />
      <span className="pw-done-mark" aria-hidden="true"><Icon name="check" size={40} weight="bold" /></span>
      <h1 className="pw-done-title" id="pw-done-title" tabIndex={-1} ref={(el) => el?.focus()}>密碼已順利更新</h1>
      <p className="pw-done-lead">你的帳號現在更安全了，<br />可以用新密碼登入，繼續你的學習旅程。</p>
      <Link className="btn primary pw-done-cta" to="/login?method=email&reset=success">前往登入<Icon name="arrow" size={22} /></Link>
    </div></main>
  );
  return (
    <main className="auth pw-done-wrap" aria-labelledby="rp-title"><div className="pw-done login-card fp-card">
      <div className="login-head">
        <Link to="/" className="pw-done-brand">IRIS STUDIO</Link>
        <span className="pw-done-rule" aria-hidden="true" />
        <span className="pw-done-mark" aria-hidden="true"><Icon name="lock" size={30} /></span>
        <h1 className="pw-done-title" id="rp-title">設定新密碼</h1>
        <p className="pw-done-lead fp-lead">為你的 Email 登入帳號設定新密碼。</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate aria-busy={state === 'busy'}>
        <Field id="rp-pw" label="新密碼" error={tried && short ? '密碼至少需要 8 個字元。' : undefined}>
          <PasswordInput id="rp-pw" value={password} onChange={setPassword} invalid={tried && short} describedBy={tried && short ? 'rp-pw-err' : 'rp-hint'} autoComplete="new-password" disabled={state === 'busy'} />
          <p id="rp-hint" className={password.length >= 8 ? 'hint ok' : 'hint'}>{password.length >= 8 ? '✓ ' : ''}8–128 個字元，建議使用容易記住的長密碼。</p>
        </Field>
        <Field id="rp-again" label="確認新密碼" error={(tried || !!again) && mismatch ? '兩次輸入的密碼不一樣。' : undefined}>
          <PasswordInput id="rp-again" value={again} onChange={setAgain} invalid={(tried || !!again) && mismatch} describedBy={(tried || !!again) && mismatch ? 'rp-again-err' : undefined} autoComplete="new-password" disabled={state === 'busy'} />
        </Field>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn primary block" disabled={state === 'busy'}>{state === 'busy' ? '更新中…' : '更新密碼'}</button>
      </form>
      <p className="fp-hint rp-hint">更新後，所有裝置都需要重新登入。</p>
      <Link className="fp-back rp-back" to={emailLogin()}><Icon name="arrow" size={18} />回到登入</Link>
    </div></main>
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
      {!result.ok && <p className="caption">登入後可以在「我的」重新寄送驗證信。</p>}
      <Link className="btn primary block" to="/login">繼續</Link>
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
      <p className="caption">想重新訂閱，可以登入後到「我的 → 同意設定」開啟。</p>
      <Link className="btn secondary block" to="/">回到首頁</Link>
    </Card>
  );
  if (state === 'error') return <Card title="無法取消訂閱" sub={error}><Link className="btn secondary block" to="/">回到首頁</Link></Card>;
  return (
    <Card title="取消訂閱行銷訊息" sub="確認後，你將不再收到 IRIS Studio 的活動與優惠消息。預約與付款相關的通知仍會照常寄送。">
      <button className="btn primary block" disabled={state === 'busy'} onClick={go}>確認取消訂閱</button>
      <Link className="btn link" to="/">先不要</Link>
    </Card>
  );
}
