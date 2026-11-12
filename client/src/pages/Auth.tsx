import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { qk, session, useLogout, useMe } from '../lib/queries';
import { CONSENT_TEXT, CONSENT_VERSION } from '../lib/legal';
import { PASSWORD_RULES, passwordOk } from '../lib/password';
import type { ConsentInput, Me } from '../lib/types';
import { Icon } from '../components/Icon';
import { IrisLogo } from '../components/IrisLogo';

/** Demo accounts and the fake LINE login exist only in the mock / prototype builds. */
const DEMO = import.meta.env.MODE === 'mock' || import.meta.env.MODE === 'proto';
/** Consents chosen before LINE sign-up wait here until the new account exists (see Pending). */
const PENDING_CONSENT = 'iris-pending-consent';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const homeOf = (me: Me) => (me.role === 'Teacher' ? '/teacher' : me.status === 'Pending' ? '/pending' : '/app');
const errText = (e: unknown) => (e instanceof Error ? e.message : '發生錯誤，請稍後再試。');

/** Email is checked 0.6 s after typing stops (or on blur), not on every key. */
function useSettled(value: string): [boolean, (v: boolean) => void] {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!value) return;
    const t = setTimeout(() => setSettled(true), 600);
    return () => clearTimeout(t);
  }, [value]);
  return [settled, setSettled];
}

/** Card shell shared by every account page: 首頁 link, logo, then the page. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="auth au">
      <div className="au-card">
        <Link to="/" className="au-home" viewTransition><Icon name="back" size={16} />首頁</Link>
        <Link to="/" className="au-brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition>
          <IrisLogo variant="full" /><span>聲樂工作室</span>
        </Link>
        {children}
      </div>
    </div>
  );
}

const Req = () => <span className="au-req" aria-hidden="true">*</span>;
const Err = ({ id, children }: { id: string; children: ReactNode }) => <p className="au-err" id={id} role="alert">{children}</p>;

/** Live password checklist (○ → ✓). `history` adds the reset-only rule about the last 3 passwords. */
function PasswordChecklist({ id, value, history }: { id: string; value: string; history?: boolean }) {
  return (
    <ul className="au-rules" id={id} aria-label="密碼條件">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.label} className={ok ? 'ok' : undefined}>
            <span aria-hidden="true">{ok ? '✓' : '○'}</span>{r.label}
            <span className="sr-only">{ok ? '（已符合）' : '（未符合）'}</span>
          </li>
        );
      })}
      {history && <li className="info"><span aria-hidden="true">i</span>不能和最近 3 次的密碼相同</li>}
    </ul>
  );
}

/** Password box with the eye toggle inside. */
function PasswordBox({ id, label, value, onChange, onBlur, error, placeholder, autoComplete, describedBy }: {
  id: string; label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; error: string;
  placeholder: string; autoComplete: 'new-password' | 'current-password'; describedBy?: string;
}) {
  const [shown, setShown] = useState(false);
  const described = [error && `${id}-err`, describedBy].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}<Req /><span className="sr-only">（必填）</span></label>
      <div className="au-pw">
        <input id={id} className={`input${error ? ' is-error' : ''}`} type={shown ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder}
          required value={value} aria-invalid={!!error} aria-describedby={described} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
        <button type="button" className="au-eye" aria-label={shown ? `隱藏${label}` : `顯示${label}`} aria-pressed={shown} onClick={() => setShown(!shown)}>
          <Icon name={shown ? 'eyeOff' : 'eye'} size={20} />
        </button>
      </div>
      {error && <Err id={`${id}-err`}>{error}</Err>}
    </div>
  );
}

/** After sign-in: fetch /api/me fresh and go where this account belongs (or back to the page that sent us here). */
function useAfterSignIn() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  return async () => {
    const me = await qc.fetchQuery({ queryKey: qk.me, queryFn: () => api.get<Me | null>('/api/me'), staleTime: 0 });
    if (me) navigate((location.state as { from?: string } | null)?.from ?? homeOf(me), { replace: true, viewTransition: true });
  };
}

export function Login() {
  const me = useMe();
  const location = useLocation();
  const afterSignIn = useAfterSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailSettled, setEmailSettled] = useSettled(email);
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teacher, setTeacher] = useState(false);
  const lineFailed = new URLSearchParams(location.search).get('error');
  const state = location.state as { reset?: boolean } | null;

  if (me.data) return <Navigate to={homeOf(me.data)} replace />;

  const emailProblem = !email.trim() ? '請輸入 Email' : EMAIL.test(email.trim()) ? null : 'Email 格式不正確，例如 name@example.com';
  const emailError = (emailSettled || tried) && emailProblem;
  const passwordError = tried && !password ? '請輸入密碼' : serverError;

  const signIn = async () => {
    setBusy(true); setServerError(null);
    try { await api.post('/api/auth/login', { email: email.trim(), password }); await afterSignIn(); }
    catch (e) { setServerError(errText(e)); }
    finally { setBusy(false); }
  };
  const lineLogin = async (as = 's1') => {
    if (!DEMO) { window.location.href = '/api/auth/line?returnUrl=%2Fapp'; return; }
    setBusy(true);
    try { await api.post('/api/auth/line/mock', { as }); await afterSignIn(); }
    finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (emailProblem || !password) return;
    void signIn();
  };

  return (
    <div className="auth au">
      <div className="au-card">
        <Link to="/" className="au-home" viewTransition><Icon name="back" size={16} />首頁</Link>
        <Link to="/" className="au-brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition><IrisLogo variant="full" /><span>聲樂工作室</span></Link>
        <div className="au-head">
          <h1 className="au-h1">{teacher ? '老師登入' : '歡迎回來'}</h1>
          <p className="au-sub">{teacher ? '用工作室的 Email 和密碼登入。' : '登入後就可以預約下一堂課'}</p>
        </div>
        {lineFailed && <div className="notice error" role="alert"><Icon name="info" /><span>LINE 登入沒有完成，請再試一次。</span></div>}
        {state?.reset && <div className="notice ok" role="status"><Icon name="check" /><span>密碼已更新，請用新密碼登入。</span></div>}
        <form className="au-form" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="em">Email</label>
            <input id="em" placeholder="name@example.com" className={`input${emailError ? ' is-error' : ''}`} type="email" inputMode="email" autoComplete="username"
              value={email} aria-invalid={!!emailError} aria-describedby={emailError ? 'em-err' : undefined}
              onChange={(e) => { setEmail(e.target.value); setEmailSettled(false); }} onBlur={() => email && setEmailSettled(true)} />
            {emailError && <Err id="em-err">{emailProblem}</Err>}
          </div>
          <div className="field">
            <label htmlFor="pw">密碼</label>
            <input id="pw" placeholder="輸入你的密碼" className={`input${passwordError ? ' is-error' : ''}`} type="password" autoComplete="current-password"
              value={password} aria-invalid={!!passwordError} aria-describedby={passwordError ? 'pw-err' : undefined}
              onChange={(e) => { setPassword(e.target.value); setServerError(null); }} />
            <div className="au-pw-row">
              {passwordError ? <Err id="pw-err">{passwordError}</Err> : <span />}
              <Link to="/forgot-password" className="au-forgot" viewTransition>忘記密碼？</Link>
            </div>
          </div>
          <button className="au-btn primary au-glow" disabled={busy}>{busy ? '登入中…' : '登入'}</button>
        </form>
        <div className="au-divider"><span>其他</span></div>
        <div className="au-alt">
          <button type="button" className="au-btn" disabled={busy} onClick={() => void lineLogin()}>
            <span className="li-mark" aria-hidden="true"><Icon name="msg" size={14} /></span>LINE 登入
          </button>
          <button type="button" className={`au-btn${teacher ? ' is-on' : ''}`} aria-pressed={teacher}
            onClick={() => { setTeacher(!teacher); setServerError(null); document.getElementById('em')?.focus(); }}>
            <span className="t-mark" aria-hidden="true">師</span>老師登入
          </button>
        </div>
        <p className="au-foot">第一次來 IRIS？<Link to="/register" viewTransition>建立帳號 <span aria-hidden="true">→</span></Link></p>
      </div>
      {DEMO && (
        <section className="au-demo" aria-labelledby="au-demo-h">
          <h2 id="au-demo-h">示範帳號</h2>
          <div>
            <button disabled={busy} onClick={() => void lineLogin('s1')}>學生 王小明</button>
            <button disabled={busy} onClick={() => void lineLogin('s6')}>新學生（等待確認）</button>
            <button disabled={busy} onClick={() => void lineLogin('t1')}>老師 Iris</button>
          </div>
        </section>
      )}
    </div>
  );
}

/** 建立帳號 → Iris 確認 → 開始預約 */
function Journey({ step }: { step: number }) {
  const steps = ['建立帳號', 'Iris 確認', '開始預約'];
  return (
    <ol className="au-journey" aria-label="加入流程">
      {steps.map((s, i) => (
        <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
          <span className="au-jdot" aria-hidden="true">{i < step ? <Icon name="check" size={12} weight="bold" /> : i + 1}</span>
          <span className="au-jt">{s}</span>
        </li>
      ))}
    </ol>
  );
}

type RegField = 'email' | 'name' | 'password' | 'confirm';

export function Register() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<Record<RegField, string>>({ email: '', name: '', password: '', confirm: '' });
  const [blurred, setBlurred] = useState<Record<RegField, boolean>>({ email: false, name: false, password: false, confirm: false });
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [c, setC] = useState({ terms: false, media: false, marketing: false, minor: false, gName: '', gRel: '', gContact: '', gAgree: false });

  useEffect(() => {
    if (!form.email) return;
    const t = setTimeout(() => setBlurred((b) => ({ ...b, email: true })), 600);
    return () => clearTimeout(t);
  }, [form.email]);
  if (me.data) return <Navigate to={homeOf(me.data)} replace />;

  const guardianErr = {
    name: c.minor && !c.gName.trim() ? '法定代理人姓名不能空白。' : '',
    rel: c.minor && !c.gRel ? '關係不能空白，請選擇。' : '',
    contact: c.minor && !c.gContact.trim() ? '法定代理人聯絡方式不能空白。' : '',
  };
  const consentErr = !c.terms ? '請閱讀並勾選同意服務條款與隱私權政策。'
    : c.minor && (guardianErr.name || guardianErr.rel || guardianErr.contact || !c.gAgree) ? '未滿 18 歲，請填寫法定代理人資料並由法定代理人勾選同意。' : '';
  const problems: Record<RegField, string> = {
    email: !form.email.trim() ? 'Email 不能空白。' : EMAIL.test(form.email.trim()) ? '' : 'Email 格式不正確，例如 name@example.com',
    name: form.name.trim() ? '' : '姓名不能空白。',
    password: !form.password ? '密碼不能空白。' : passwordOk(form.password) ? '' : '密碼還不符合下面的條件。',
    confirm: !form.confirm ? '確認密碼不能空白。' : form.confirm !== form.password ? '兩次輸入的密碼不一樣。' : '',
  };
  const shown = (f: RegField) => ((tried || blurred[f]) && problems[f] ? problems[f] : '');
  const set = (f: RegField) => (v: string) => { setForm({ ...form, [f]: v }); setBlurred((b) => ({ ...b, [f]: false })); };
  const blur = (f: RegField) => () => { if (form[f]) setBlurred((b) => ({ ...b, [f]: true })); };
  const input = (f: RegField) => ({
    className: `input${shown(f) ? ' is-error' : ''}`, value: form[f], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(f)(e.target.value),
    onBlur: blur(f), 'aria-invalid': !!shown(f), 'aria-describedby': shown(f) ? `${f}-err` : undefined,
  });
  const consents = (): ConsentInput => ({
    version: CONSENT_VERSION, terms: c.terms, media: c.media, marketing: c.marketing, minor: c.minor,
    guardian: c.minor ? { name: c.gName.trim(), relation: c.gRel.trim(), contact: c.gContact.trim(), agreed: c.gAgree } : null,
  });
  const gErr = (k: keyof typeof guardianErr) => (tried && guardianErr[k] ? <Err id={`g-${k}-err`}>{guardianErr[k]}</Err> : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setTried(true); setServerError(null);
    if (Object.values(problems).some(Boolean) || consentErr) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.au-form [aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/auth/register', { name: form.name.trim(), email: form.email.trim(), phone: null, password: form.password, consents: consents() });
      await qc.fetchQuery({ queryKey: qk.me, queryFn: () => api.get<Me | null>('/api/me'), staleTime: 0 });
      navigate('/pending', { replace: true, viewTransition: true });
    } catch (err) { setServerError(errText(err)); }
    finally { setBusy(false); }
  };

  return (
    <AuthCard>
      <Journey step={0} />
      <div className="au-head">
        <h1 className="au-h1">建立你的帳號</h1>
        <p className="au-sub">用 Email 註冊，Iris 確認後就可以開始預約。</p>
        <p className="au-req-note"><Req /> 為必填欄位</p>
      </div>
      <form className="au-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="re">Email<Req /></label>
          <input id="re" required type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" {...input('email')} />
          {shown('email') && <Err id="email-err">{shown('email')}</Err>}
        </div>
        <div className="field">
          <label htmlFor="rn">姓名<Req /></label>
          <input id="rn" required autoComplete="name" placeholder="例如：王小明" {...input('name')} />
          {shown('name') && <Err id="name-err">{shown('name')}</Err>}
        </div>
        <PasswordBox id="rw" label="密碼" value={form.password} onChange={set('password')} onBlur={blur('password')} error={shown('password')}
          placeholder="例如：Sing2026" autoComplete="new-password" describedBy="pw-rules" />
        <PasswordChecklist id="pw-rules" value={form.password} />
        <PasswordBox id="rw2" label="確認密碼" value={form.confirm} onChange={set('confirm')} onBlur={blur('confirm')} error={shown('confirm')}
          placeholder="再輸入一次密碼" autoComplete="new-password" />

        <fieldset className="au-consent" aria-describedby={tried && consentErr ? 'consent-err' : undefined}>
          <legend>開始之前</legend>
          <label className="au-ck req">
            <input type="checkbox" checked={c.terms} onChange={(e) => setC({ ...c, terms: e.target.checked })} aria-invalid={tried && !c.terms} />
            <span>我已閱讀並同意<Link to="/legal/terms" target="_blank">《服務條款》</Link>，並已閱讀<Link to="/legal/privacy" target="_blank">《隱私權政策》</Link>中的個人資料告知事項。<em>（必填）</em></span>
          </label>
          <p className="au-c-group">以下為選擇性同意，不勾選也能正常上課</p>
          <label className="au-ck">
            <input type="checkbox" checked={c.media} onChange={(e) => setC({ ...c, media: e.target.checked })} />
            <span>{CONSENT_TEXT.media.replace('（詳見《肖像與影音授權》）', '')}<Link to="/legal/media" target="_blank">了解授權範圍</Link></span>
          </label>
          <label className="au-ck">
            <input type="checkbox" checked={c.marketing} onChange={(e) => setC({ ...c, marketing: e.target.checked })} />
            <span>{CONSENT_TEXT.marketing}</span>
          </label>
          <label className="au-ck minor">
            <input type="checkbox" checked={c.minor} onChange={(e) => setC({ ...c, minor: e.target.checked })} />
            <span>我未滿 18 歲</span>
          </label>
          {c.minor && (
            <div className="au-guardian">
              <p className="au-c-group">法定代理人（父母或監護人）</p>
              <div className="field">
                <label htmlFor="g-name">法定代理人姓名<Req /></label>
                <input id="g-name" required className={`input${tried && guardianErr.name ? ' is-error' : ''}`} aria-invalid={tried && !!guardianErr.name}
                  autoComplete="off" placeholder="例如：王大明" value={c.gName} onChange={(e) => setC({ ...c, gName: e.target.value })} />
                {gErr('name')}
              </div>
              <div className="field">
                <label htmlFor="g-rel">關係<Req /></label>
                <select id="g-rel" required className={`input${tried && guardianErr.rel ? ' is-error' : ''}`} aria-invalid={tried && !!guardianErr.rel}
                  value={c.gRel} onChange={(e) => setC({ ...c, gRel: e.target.value })}>
                  <option value="">請選擇</option><option>父親</option><option>母親</option><option>監護人</option>
                </select>
                {gErr('rel')}
              </div>
              <div className="field">
                <label htmlFor="g-contact">法定代理人聯絡方式（電話或 Email）<Req /></label>
                <input id="g-contact" required className={`input${tried && guardianErr.contact ? ' is-error' : ''}`} aria-invalid={tried && !!guardianErr.contact}
                  autoComplete="off" placeholder="例如：0912-345-678" value={c.gContact} onChange={(e) => setC({ ...c, gContact: e.target.value })} />
                {gErr('contact')}
              </div>
              <label className="au-ck req">
                <input type="checkbox" checked={c.gAgree} onChange={(e) => setC({ ...c, gAgree: e.target.checked })} />
                <span>{CONSENT_TEXT.guardian}<em>（請由法定代理人勾選）</em></span>
              </label>
            </div>
          )}
          {tried && consentErr && <Err id="consent-err">{consentErr}</Err>}
        </fieldset>
        {serverError && <div className="notice error" role="alert"><Icon name="info" /><span>{serverError}</span></div>}
        <button className="au-btn primary au-glow" disabled={busy}>{busy ? '建立中…' : '建立帳號'}</button>
      </form>
      <p className="au-foot">已經有帳號？<Link to="/login" viewTransition>登入</Link></p>
    </AuthCard>
  );
}

/** 等待 Iris 確認: polls every 10 s and enters the app by itself once approved. */
export function Pending() {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useLogout();
  useEffect(() => {
    const t = window.setInterval(() => qc.invalidateQueries({ queryKey: qk.me }), 10_000);
    return () => window.clearInterval(t);
  }, [qc]);
  useEffect(() => {
    if (!me.data) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(PENDING_CONSENT); } catch { /* storage blocked */ }
    if (raw) api.post('/api/me/consents', JSON.parse(raw)).then(() => { try { sessionStorage.removeItem(PENDING_CONSENT); } catch { /* */ } }).catch(() => {});
  }, [me.data]);

  if (me.isPending) return null;
  if (!me.data) return <Navigate to={session.loggingOut ? '/' : '/login'} replace />;
  if (me.data.status === 'Active') return <Navigate to={homeOf(me.data)} replace />;
  const name = me.data.name;
  return (
    <AuthCard>
      <Journey step={1} />
      <div className="au-done">
        <span className="au-wait" aria-hidden="true"><Icon name="clock" size={24} /></span>
        <p className="au-kicker">申請已送出</p>
        <h1 className="au-h1">等待 Iris 確認</h1>
        <p className="au-sub">Iris 會親自確認你的帳號，通常會在 1 天內完成。確認後我們會通知你。</p>
      </div>
      <p className="au-next">確認後，就可以購買堂數並預約第一堂課。</p>
      <p className="au-switch">
        不是{/^[A-Za-z]/.test(name) ? ' ' : ''}{name}？
        <button className="au-inline" onClick={() => { navigate('/login'); logout.mutate(); }}>切換帳號</button>
      </p>
    </AuthCard>
  );
}

/** /forgot-password — the answer never says whether the email has an account. */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [settled, setSettled] = useSettled(email);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ demoLink?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const problem = !email.trim() ? '請輸入 Email。' : EMAIL.test(email.trim()) ? null : 'Email 格式不正確，例如 name@example.com';
  const shownError = (settled || tried) && problem;

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setTried(true); setError(null);
    if (problem) return;
    setBusy(true);
    try { setSent((await api.post<{ demoLink?: string } | undefined>('/api/auth/forgot-password', { email: email.trim() })) ?? {}); }
    catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };

  return (
    <AuthCard>
      {sent ? (
        <div className="au-head au-sent" role="status">
          <span className="au-sent-ic" aria-hidden="true"><Icon name="mail" size={28} /></span>
          <h1 className="au-h1">請到信箱收信</h1>
          <p className="au-sub">如果 <b>{email.trim()}</b> 有註冊帳號，我們已經寄出重設密碼的連結。連結 30 分鐘內有效，只能使用一次。</p>
          <p className="caption">沒收到？請檢查垃圾信件匣，或<button type="button" className="au-link" onClick={() => setSent(null)}>重新寄送</button>。</p>
          {sent.demoLink && <Link to={sent.demoLink} className="au-btn au-demo-link">（示範）打開信中的連結</Link>}
        </div>
      ) : (
        <>
          <div className="au-head">
            <h1 className="au-h1">忘記密碼</h1>
            <p className="au-sub">輸入註冊時的 Email，我們會寄一封重設密碼的信給你。</p>
          </div>
          <form className="au-form" onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="fe">Email<Req /></label>
              <input id="fe" className={`input${shownError ? ' is-error' : ''}`} type="email" inputMode="email" autoComplete="username" placeholder="name@example.com"
                required value={email} aria-invalid={!!shownError} aria-describedby={shownError ? 'fe-err' : undefined}
                onChange={(e) => { setEmail(e.target.value); setSettled(false); }} onBlur={() => email && setSettled(true)} />
              {shownError && <Err id="fe-err">{problem}</Err>}
            </div>
            {error && <div className="notice error" role="alert"><Icon name="info" /><span>{error}</span></div>}
            <button className="au-btn primary au-glow" disabled={busy}>{busy ? '寄送中…' : '寄送重設連結'}</button>
          </form>
        </>
      )}
      <p className="au-foot"><Link to="/login" viewTransition>← 回到登入</Link></p>
    </AuthCard>
  );
}

/** /reset-password?token=… — the link is checked first (checking never uses it up). */
export function ResetPassword() {
  const navigate = useNavigate();
  const token = new URLSearchParams(useLocation().search).get('token') ?? '';
  const [valid, setValid] = useState<boolean | null>(token ? null : false);
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [blurred, setBlurred] = useState({ password: false, confirm: false });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    api.post('/api/auth/reset-password/validate', { token }).then(() => live && setValid(true)).catch(() => live && setValid(false));
    return () => { live = false; };
  }, [token]);

  const problems = {
    password: !form.password ? '請輸入新密碼。' : passwordOk(form.password) ? '' : '密碼還不符合下面的條件。',
    confirm: !form.confirm ? '請再輸入一次新密碼。' : form.confirm !== form.password ? '兩次輸入的密碼不一樣。' : '',
  };
  const shown = (f: 'password' | 'confirm') => ((tried || blurred[f]) && problems[f] ? problems[f] : '');
  const set = (f: 'password' | 'confirm') => (v: string) => { setForm({ ...form, [f]: v }); setBlurred({ ...blurred, [f]: false }); setError(null); };
  const blur = (f: 'password' | 'confirm') => () => { if (form[f]) setBlurred({ ...blurred, [f]: true }); };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setTried(true); setError(null);
    if (problems.password || problems.confirm) return;
    setBusy(true);
    try {
      await api.post('/api/auth/reset-password', { token, password: form.password });
      navigate('/login', { replace: true, state: { reset: true }, viewTransition: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_token') setValid(false);
      else setError(errText(err));
      setBusy(false);
    }
  };

  return (
    <AuthCard>
      {valid === null ? (
        <div className="au-head" role="status"><p className="au-sub">正在確認連結…</p></div>
      ) : valid ? (
        <>
          <div className="au-head">
            <h1 className="au-h1">設定新密碼</h1>
            <p className="au-sub">請輸入新的密碼，完成後用新密碼登入。</p>
          </div>
          <form className="au-form" onSubmit={submit} noValidate>
            <PasswordBox id="rp1" label="新密碼" value={form.password} onChange={set('password')} onBlur={blur('password')} error={shown('password')}
              placeholder="例如：Sing2026" autoComplete="new-password" describedBy="rp-rules" />
            <PasswordChecklist id="rp-rules" value={form.password} history />
            <PasswordBox id="rp2" label="確認新密碼" value={form.confirm} onChange={set('confirm')} onBlur={blur('confirm')} error={shown('confirm')}
              placeholder="再輸入一次新密碼" autoComplete="new-password" />
            {error && <div className="notice error" role="alert"><Icon name="info" /><span>{error}</span></div>}
            <div className="au-confirm-row">
              <button className="au-btn primary au-glow au-press" disabled={busy}>{busy ? '處理中…' : '確認'}</button>
            </div>
          </form>
        </>
      ) : (
        <div className="au-head" role="alert">
          <h1 className="au-h1">連結已失效</h1>
          <p className="au-sub">這個重設連結已經過期或使用過了。請重新申請，我們會再寄一封新的信給你。</p>
          <Link to="/forgot-password" className="au-btn primary au-glow">重新申請重設密碼</Link>
        </div>
      )}
      <p className="au-foot"><Link to="/login" viewTransition>← 回到登入</Link></p>
    </AuthCard>
  );
}
