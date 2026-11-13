import { Logo } from '../components/Logo';
import { useBusyOverlay } from '../components/Busy';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { qk, session, useLogout, useMe } from '../lib/queries';
import type { ConsentInput, Me } from '../lib/types';
import { CONSENT_TEXT, CONSENT_VERSION } from '../lib/legal';
import { PW_RULES } from '../lib/password';

/** LINE sign-up leaves the site for LINE, so the choices wait here and are sent once the account exists (Pending). */
const PENDING_CONSENT = 'iris-pending-consent';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOCK = import.meta.env.MODE === 'mock' || import.meta.env.MODE === 'proto';
const home = (me: Me) => (me.role === 'Teacher' ? '/teacher' : me.status === 'Pending' ? '/pending' : '/app');

export function Login() {
  const me = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string; reset?: boolean } };
  const [emailTouched, setEmailTouched] = useState(false);
  const [tried, setTried] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useBusyOverlay(busy); // 登入: white veil + blur + spinner over the whole screen while signing in
  // every hook must run before the early return below (React counts hooks per render)
  const [mode, setMode] = useState<'student' | 'teacher'>('student');
  const err = new URLSearchParams(useLocation().search).get('error');
  // "finished typing" = no key pressed for 600 ms; then show the Email check (hooks stay above the early return)
  useEffect(() => { if (!email) return; const t = setTimeout(() => setEmailTouched(true), 600); return () => clearTimeout(t); }, [email]);

  if (me.data) return <Navigate to={home(me.data)} replace />;

  // Re-read /api/me after signing in so every page gets the full, fresh profile (not just the login reply).
  const done = async () => {
    const u = await qc.fetchQuery({ queryKey: qk.me, queryFn: () => api.get<Me | null>('/api/me'), staleTime: 0 });
    if (u) nav(loc.state?.from ?? home(u), { replace: true, viewTransition: true });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    // keep the busy layer up at least 0.6 s, so it reads as "working" instead of a flash
    try { await Promise.all([api.post('/api/auth/login', { email, password }), new Promise((r) => setTimeout(r, 600))]); await done(); }
    catch (x) { setError((x as Error).message); }
    finally { setBusy(false); }
  };
  const mockLine = async (as: string) => { setBusy(true); try { await Promise.all([api.post('/api/auth/line/mock', { as }), new Promise((r) => setTimeout(r, 600))]); await done(); } finally { setBusy(false); } };

  // Email is checked once the user stops typing (600 ms) or leaves the box — not on every key, which would shout "invalid" mid-typing.
  const emailProblem = !email.trim() ? '請輸入 Email' : !EMAIL_RE.test(email.trim()) ? 'Email 格式不正確，例如 name@example.com' : null;
  const showEmailErr = (emailTouched || tried) && emailProblem;
  const pwProblem = tried && !password ? '請輸入密碼' : error;
  const onLogin = (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (emailProblem || !password) return;
    void submit(e);
  };
  const lineMark = <span className="li-mark" aria-hidden="true"><Icon name="msg" size={14} /></span>;
  const teacher = mode === 'teacher';

  return (
    <div className="auth au">
      <div className="au-card">
        {/* quiet way back to the website; the logo below links there too */}
        <Link to="/" className="au-home" viewTransition><Icon name="back" size={16} />首頁</Link>
        <Link to="/" className="au-brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition><Logo variant="full" /><span>聲樂工作室</span></Link>
        <div className="au-head">
          <h1 className="au-h1">{teacher ? '老師登入' : '歡迎回來'}</h1>
          <p className="au-sub">{teacher ? '用工作室的 Email 和密碼登入。' : '登入後就可以預約下一堂課'}</p>
        </div>
        {err && <div className="notice error" role="alert"><Icon name="info" /><span>LINE 登入沒有完成，請再試一次。</span></div>}
        {loc.state?.reset && <div className="notice ok" role="status"><Icon name="check" /><span>密碼已更新，請用新密碼登入。</span></div>}

        <form className="au-form" onSubmit={onLogin} noValidate>
          <div className="field">
            <label htmlFor="em">Email</label>
            <input id="em" placeholder="name@example.com" className={`input${showEmailErr ? ' is-error' : ''}`} type="email" inputMode="email" autoComplete="username" value={email}
              aria-invalid={!!showEmailErr} aria-describedby={showEmailErr ? 'em-err' : undefined}
              onChange={(e) => { setEmail(e.target.value); setEmailTouched(false); }} onBlur={() => email && setEmailTouched(true)} />
            {showEmailErr && <p className="au-err" id="em-err" role="alert">{emailProblem}</p>}
          </div>
          <div className="field">
            <label htmlFor="pw">密碼</label>
            <input id="pw" placeholder="輸入你的密碼" className={`input${pwProblem ? ' is-error' : ''}`} type="password" autoComplete="current-password" value={password}
              aria-invalid={!!pwProblem} aria-describedby={pwProblem ? 'pw-err' : undefined}
              onChange={(e) => { setPassword(e.target.value); setError(null); }} />
            <div className="au-pw-row">
              {pwProblem ? <p className="au-err" id="pw-err" role="alert">{pwProblem}</p> : <span />}
              <Link to="/forgot-password" className="au-forgot" viewTransition>忘記密碼？</Link>
            </div>
          </div>
          <button className="au-btn primary au-glow" disabled={busy}>{busy ? '登入中…' : '登入'}</button>
        </form>

        <div className="au-divider"><span>其他</span></div>
        <div className="au-alt">
          {MOCK
            ? <button type="button" className="au-btn" disabled={busy} onClick={() => mockLine('s1')}>{lineMark}LINE 登入</button>
            // Real LINE Login is an OAuth redirect handled by the server, so it's a plain link, not fetch.
            : <a className="au-btn" href={`/api/auth/line?returnUrl=${encodeURIComponent(loc.state?.from ?? '')}`}>{lineMark}LINE 登入</a>}
          <button type="button" className={`au-btn${teacher ? ' is-on' : ''}`} aria-pressed={teacher}
            onClick={() => { setMode(teacher ? 'student' : 'teacher'); setError(null); document.getElementById('em')?.focus(); }}>
            <span className="t-mark" aria-hidden="true">師</span>老師登入
          </button>
        </div>

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
  // back from LINE sign-up: store the consent choices made before leaving (then forget them)
  useEffect(() => {
    if (!me.data) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(PENDING_CONSENT); } catch { /* storage blocked */ }
    if (!raw) return;
    api.post('/api/me/consents', JSON.parse(raw)).then(() => { try { sessionStorage.removeItem(PENDING_CONSENT); } catch { /* */ } }).catch(() => {});
  }, [me.data]);
  if (me.isPending) return null;
  if (!me.data) return <Navigate to={session.loggingOut ? '/' : '/login'} replace />;
  if (me.data.status === 'Active') return <Navigate to={home(me.data)} replace />;
  return (
    <div className="auth au">
      <div className="au-card">
        {/* quiet way back to the website; the logo below links there too */}
        <Link to="/" className="au-home" viewTransition><Icon name="back" size={16} />首頁</Link>
        <Link to="/" className="au-brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition><Logo variant="full" /><span>聲樂工作室</span></Link>
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
  const [f, setF] = useState({ email: '', name: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [tried, setTried] = useState(false);
  // per-field "the user has finished with this one" → show its error (not while they are still typing)
  const [done, setDone] = useState({ email: false, name: false, password: false, confirm: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // consents: terms required; media + marketing optional and UNchecked; a minor needs a guardian
  const [c, setC] = useState({ terms: false, media: false, marketing: false, minor: false, gName: '', gRel: '', gContact: '', gAgree: false });
  // Email is checked 600 ms after the last key, same as the login page (hooks stay above the early return)
  useEffect(() => { if (!f.email) return; const t = setTimeout(() => setDone((d) => ({ ...d, email: true })), 600); return () => clearTimeout(t); }, [f.email]);
  if (me.data) return <Navigate to={home(me.data)} replace />;

  // a minor's guardian fields are required too (each says which one is empty)
  const gErr = { name: c.minor && !c.gName.trim() ? '法定代理人姓名不能空白。' : '', rel: c.minor && !c.gRel ? '關係不能空白，請選擇。' : '',
    contact: c.minor && !c.gContact.trim() ? '法定代理人聯絡方式不能空白。' : '' };
  const consentErr = !c.terms ? '請閱讀並勾選同意服務條款與隱私權政策。'
    : c.minor && (gErr.name || gErr.rel || gErr.contact || !c.gAgree) ? '未滿 18 歲，請填寫法定代理人資料並由法定代理人勾選同意。' : '';
  const gMsg = (k: keyof typeof gErr) => (tried && gErr[k] ? <p className="au-err" id={`g-${k}-err`} role="alert">{gErr[k]}</p> : null);
  const consents = (): ConsentInput => ({ version: CONSENT_VERSION, terms: c.terms, media: c.media, marketing: c.marketing, minor: c.minor,
    guardian: c.minor ? { name: c.gName.trim(), relation: c.gRel.trim(), contact: c.gContact.trim(), agreed: c.gAgree } : null });

  const pwOk = PW_RULES.every((r) => r.test(f.password));
  const errs = {
    email: !f.email.trim() ? 'Email 不能空白。' : !EMAIL_RE.test(f.email.trim()) ? 'Email 格式不正確，例如 name@example.com' : '',
    name: !f.name.trim() ? '姓名不能空白。' : '',
    password: !f.password ? '密碼不能空白。' : !pwOk ? '密碼還不符合下面的條件。' : '',
    confirm: !f.confirm ? '確認密碼不能空白。' : f.confirm !== f.password ? '兩次輸入的密碼不一樣。' : '',
  };
  type K = keyof typeof errs;
  const invalid = Object.values(errs).some(Boolean);
  const set = (k: K) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); if (k !== 'email') setDone((d) => ({ ...d, [k]: false })); else setDone((d) => ({ ...d, email: false })); };
  const leave = (k: K) => () => { if (f[k]) setDone((d) => ({ ...d, [k]: true })); };
  const err = (k: K) => ((tried || done[k]) && errs[k] ? errs[k] : '');
  const msg = (k: K) => (err(k) ? <p className="au-err" id={`${k}-err`} role="alert">{err(k)}</p> : null);
  const inputProps = (k: K) => ({ className: `input${err(k) ? ' is-error' : ''}`, value: f[k], onChange: set(k), onBlur: leave(k), 'aria-invalid': !!err(k), 'aria-describedby': err(k) ? `${k}-err` : undefined });

  const finish = async () => {
    await qc.fetchQuery({ queryKey: qk.me, queryFn: () => api.get<Me | null>('/api/me'), staleTime: 0 });
    nav('/pending', { replace: true, viewTransition: true });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setTried(true); setError(null);
    if (invalid || consentErr) {
      // jump to the first field that needs attention, so the error isn't missed below the fold
      requestAnimationFrame(() => (document.querySelector('.au-form [aria-invalid="true"]') as HTMLElement | null)?.focus());
      return;
    }
    setBusy(true);
    try { await api.post('/api/auth/register', { name: f.name.trim(), email: f.email.trim(), phone: null, password: f.password, consents: consents() }); await finish(); }
    catch (x) { setError((x as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth au">
      <div className="au-card">
        {/* quiet way back to the website; the logo below links there too */}
        <Link to="/" className="au-home" viewTransition><Icon name="back" size={16} />首頁</Link>
        <Link to="/" className="au-brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition><Logo variant="full" /><span>聲樂工作室</span></Link>
        <Journey step={0} />
        <div className="au-head">
          <h1 className="au-h1">建立你的帳號</h1>
          <p className="au-sub">用 Email 註冊，Iris 確認後就可以開始預約。</p>
          <p className="au-req-note"><span className="au-req" aria-hidden="true">*</span> 為必填欄位</p>
        </div>
        <form className="au-form" onSubmit={submit} noValidate>
          <div className="field"><label htmlFor="re">Email<span className="au-req" aria-hidden="true">*</span></label>
            <input id="re" required type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" {...inputProps('email')} />{msg('email')}</div>
          <div className="field"><label htmlFor="rn">姓名<span className="au-req" aria-hidden="true">*</span></label>
            <input id="rn" required autoComplete="name" placeholder="例如：王小明" {...inputProps('name')} />{msg('name')}</div>
          <div className="field"><label htmlFor="rw">密碼<span className="au-req" aria-hidden="true">*</span></label>
            <div className="au-pw">
              <input id="rw" required type={showPw ? 'text' : 'password'} autoComplete="new-password" placeholder="例如：Sing2026" {...inputProps('password')}
                aria-describedby={[err('password') && 'password-err', 'pw-rules'].filter(Boolean).join(' ')} />
              <button type="button" className="au-eye" aria-label={showPw ? '隱藏密碼' : '顯示密碼'} aria-pressed={showPw} onClick={() => setShowPw(!showPw)}><Icon name={showPw ? 'eyeOff' : 'eye'} size={20} /></button>
            </div>
            {msg('password')}
            {/* live checklist: each rule turns ✓ as soon as it's met, so the user knows what's missing before submitting */}
            <ul className="au-rules" id="pw-rules" aria-label="密碼條件">
              {PW_RULES.map((r) => { const ok = r.test(f.password); return <li key={r.label} className={ok ? 'ok' : undefined}><span aria-hidden="true">{ok ? '✓' : '○'}</span>{r.label}<span className="sr-only">{ok ? '（已符合）' : '（未符合）'}</span></li>; })}
            </ul>
          </div>
          <div className="field"><label htmlFor="rw2">確認密碼<span className="au-req" aria-hidden="true">*</span></label>
            <div className="au-pw">
              <input id="rw2" required type={showPw2 ? 'text' : 'password'} autoComplete="new-password" placeholder="再輸入一次密碼" {...inputProps('confirm')} />
              <button type="button" className="au-eye" aria-label={showPw2 ? '隱藏確認密碼' : '顯示確認密碼'} aria-pressed={showPw2} onClick={() => setShowPw2(!showPw2)}><Icon name={showPw2 ? 'eyeOff' : 'eye'} size={20} /></button>
            </div>
            {msg('confirm')}</div>

          {/* consents after the account fields, blended into the page (no box) */}
          <fieldset className="au-consent" aria-describedby={tried && consentErr ? 'consent-err' : undefined}>
            <legend>開始之前</legend>
            <label className="au-ck req"><input type="checkbox" checked={c.terms} onChange={(e) => setC({ ...c, terms: e.target.checked })} aria-invalid={tried && !c.terms} />
              <span>我已閱讀並同意<Link to="/legal/terms" target="_blank">《服務條款》</Link>，並已閱讀<Link to="/legal/privacy" target="_blank">《隱私權政策》</Link>中的個人資料告知事項。<em>（必填）</em></span></label>
            <p className="au-c-group">以下為選擇性同意，不勾選也能正常上課</p>
            <label className="au-ck"><input type="checkbox" checked={c.media} onChange={(e) => setC({ ...c, media: e.target.checked })} />
              <span>{CONSENT_TEXT.media.replace('（詳見《肖像與影音授權》）', '')}<Link to="/legal/media" target="_blank">了解授權範圍</Link></span></label>
            <label className="au-ck"><input type="checkbox" checked={c.marketing} onChange={(e) => setC({ ...c, marketing: e.target.checked })} />
              <span>{CONSENT_TEXT.marketing}</span></label>
            <label className="au-ck minor"><input type="checkbox" checked={c.minor} onChange={(e) => setC({ ...c, minor: e.target.checked })} />
              <span>我未滿 18 歲</span></label>
            {c.minor && (
              <div className="au-guardian">
                <p className="au-c-group">法定代理人（父母或監護人）</p>
                <div className="field"><label htmlFor="g-name">法定代理人姓名<span className="au-req" aria-hidden="true">*</span></label><input id="g-name" required className={`input${tried && gErr.name ? ' is-error' : ''}`} aria-invalid={tried && !!gErr.name} autoComplete="off" placeholder="例如：王大明" value={c.gName} onChange={(e) => setC({ ...c, gName: e.target.value })} />{gMsg('name')}</div>
                <div className="field"><label htmlFor="g-rel">關係<span className="au-req" aria-hidden="true">*</span></label>
                  <select id="g-rel" required className={`input${tried && gErr.rel ? ' is-error' : ''}`} aria-invalid={tried && !!gErr.rel} value={c.gRel} onChange={(e) => setC({ ...c, gRel: e.target.value })}><option value="">請選擇</option><option>父親</option><option>母親</option><option>監護人</option></select>{gMsg('rel')}</div>
                <div className="field"><label htmlFor="g-contact">法定代理人聯絡方式（電話或 Email）<span className="au-req" aria-hidden="true">*</span></label><input id="g-contact" required className={`input${tried && gErr.contact ? ' is-error' : ''}`} aria-invalid={tried && !!gErr.contact} autoComplete="off" placeholder="例如：0912-345-678" value={c.gContact} onChange={(e) => setC({ ...c, gContact: e.target.value })} />{gMsg('contact')}</div>
                <label className="au-ck req"><input type="checkbox" checked={c.gAgree} onChange={(e) => setC({ ...c, gAgree: e.target.checked })} />
                  <span>{CONSENT_TEXT.guardian}<em>（請由法定代理人勾選）</em></span></label>
              </div>
            )}
            {tried && consentErr && <p className="au-err" id="consent-err" role="alert">{consentErr}</p>}
          </fieldset>

          {error && <div className="notice error" role="alert"><Icon name="info" /><span>{error}</span></div>}
          <button className="au-btn primary au-glow" disabled={busy}>{busy ? '建立中…' : '建立帳號'}</button>
        </form>
        <p className="au-foot">已經有帳號？<Link to="/login" viewTransition>登入</Link></p>
      </div>
    </div>
  );
}

/* =================== 忘記密碼 =================== */
/**
 * Step 1: the student types their email. The answer is the same whether or not the email has an account,
 * so this page can't be used to find out who studies here. The real server emails a link that is valid for 30 minutes, once.
 */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ demoLink?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!email) return; const t = setTimeout(() => setTouched(true), 600); return () => clearTimeout(t); }, [email]);
  const problem = !email.trim() ? '請輸入 Email。' : !EMAIL_RE.test(email.trim()) ? 'Email 格式不正確，例如 name@example.com' : null;
  const show = (touched || tried) && problem;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setTried(true); setError(null);
    if (problem) return;
    setBusy(true);
    try { setSent(await api.post<{ ok: boolean; demoLink?: string }>('/api/auth/forgot-password', { email: email.trim() })); }
    catch (x) { setError((x as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="auth au">
      <div className="au-card">
        {/* quiet way back to the website; the logo below links there too */}
        <Link to="/" className="au-home" viewTransition><Icon name="back" size={16} />首頁</Link>
        <Link to="/" className="au-brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition><Logo variant="full" /><span>聲樂工作室</span></Link>
        {!sent ? (<>
          <div className="au-head">
            <h1 className="au-h1">忘記密碼</h1>
            <p className="au-sub">輸入註冊時的 Email，我們會寄一封重設密碼的信給你。</p>
          </div>
          <form className="au-form" onSubmit={submit} noValidate>
            <div className="field"><label htmlFor="fe">Email<span className="au-req" aria-hidden="true">*</span></label>
              <input id="fe" className={`input${show ? ' is-error' : ''}`} type="email" inputMode="email" autoComplete="username" placeholder="name@example.com" required
                value={email} aria-invalid={!!show} aria-describedby={show ? 'fe-err' : undefined}
                onChange={(e) => { setEmail(e.target.value); setTouched(false); }} onBlur={() => email && setTouched(true)} />
              {show && <p className="au-err" id="fe-err" role="alert">{problem}</p>}</div>
            {error && <div className="notice error" role="alert"><Icon name="info" /><span>{error}</span></div>}
            <button className="au-btn primary au-glow" disabled={busy}>{busy ? '寄送中…' : '寄送重設連結'}</button>
          </form>
        </>) : (
          <div className="au-head au-sent" role="status">
            <span className="au-sent-ic" aria-hidden="true"><Icon name="mail" size={28} /></span>
            <h1 className="au-h1">請到信箱收信</h1>
            <p className="au-sub">如果 <b>{email.trim()}</b> 有註冊帳號，我們已經寄出重設密碼的連結。連結 30 分鐘內有效，只能使用一次。</p>
            <p className="caption">沒收到？請檢查垃圾信件匣，或<button type="button" className="au-link" onClick={() => setSent(null)}>重新寄送</button>。</p>
            {/* the demo can't send email: open the link that the email would contain */}
            {MOCK && sent.demoLink && <Link to={sent.demoLink} className="au-btn au-demo-link">（示範）打開信中的連結</Link>}
          </div>
        )}
        <p className="au-foot"><Link to="/login" viewTransition>← 回到登入</Link></p>
      </div>
    </div>
  );
}

/**
 * Step 2: the link from the email lands here. Only the new password + confirmation.
 * The link is checked first, so an old link says so before the student types anything.
 */
export function ResetPassword() {
  const nav = useNavigate();
  const token = new URLSearchParams(useLocation().search).get('token') ?? '';
  const [valid, setValid] = useState<boolean | null>(null);
  const [f, setF] = useState({ password: '', confirm: '' });
  const [show, setShow] = useState({ password: false, confirm: false });
  const [done, setDone] = useState({ password: false, confirm: false });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.post<{ valid: boolean }>('/api/auth/reset-password/check', { token }).then((r) => live && setValid(r.valid)).catch(() => live && setValid(false));
    return () => { live = false; };
  }, [token]);

  const pwOk = PW_RULES.every((r) => r.test(f.password));
  const errs = {
    password: !f.password ? '請輸入新密碼。' : !pwOk ? '密碼還不符合下面的條件。' : '',
    confirm: !f.confirm ? '請再輸入一次新密碼。' : f.confirm !== f.password ? '兩次輸入的密碼不一樣。' : '',
  };
  type K = keyof typeof errs;
  const err = (k: K) => ((tried || done[k]) && errs[k] ? errs[k] : '');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setTried(true); setError(null);
    if (errs.password || errs.confirm) return;
    setBusy(true);
    try { await api.post('/api/auth/reset-password', { token, password: f.password }); nav('/login', { replace: true, state: { reset: true }, viewTransition: true }); }
    catch (x) {
      const ex = x as ApiErrorLike;
      if (ex.code === 'link_invalid') setValid(false); else setError(ex.message);
      setBusy(false);
    }
  };
  const field = (k: K, id: string, label: string, placeholder: string) => (
    <div className="field">
      <label htmlFor={id}>{label}<span className="au-req" aria-hidden="true">*</span><span className="sr-only">（必填）</span></label>
      <div className="au-pw">
        <input id={id} className={`input${err(k) ? ' is-error' : ''}`} type={show[k] ? 'text' : 'password'} autoComplete="new-password" placeholder={placeholder} required
          value={f[k]} aria-invalid={!!err(k)} aria-describedby={[err(k) && `${id}-err`, k === 'password' && 'rp-rules'].filter(Boolean).join(' ') || undefined}
          onChange={(e) => { setF({ ...f, [k]: e.target.value }); setDone({ ...done, [k]: false }); setError(null); }} onBlur={() => f[k] && setDone({ ...done, [k]: true })} />
        <button type="button" className="au-eye" aria-label={show[k] ? `隱藏${label}` : `顯示${label}`} aria-pressed={show[k]} onClick={() => setShow({ ...show, [k]: !show[k] })}>
          <Icon name={show[k] ? 'eyeOff' : 'eye'} size={20} /></button>
      </div>
      {err(k) && <p className="au-err" id={`${id}-err`} role="alert">{err(k)}</p>}
    </div>
  );
  return (
    <div className="auth au">
      <div className="au-card">
        {/* quiet way back to the website; the logo below links there too */}
        <Link to="/" className="au-home" viewTransition><Icon name="back" size={16} />首頁</Link>
        <Link to="/" className="au-brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition><Logo variant="full" /><span>聲樂工作室</span></Link>
        {valid === null ? <div className="au-head" role="status"><p className="au-sub">正在確認連結…</p></div>
          : !valid ? (
            <div className="au-head" role="alert">
              <h1 className="au-h1">連結已失效</h1>
              <p className="au-sub">這個重設連結已經過期或使用過了。請重新申請，我們會再寄一封新的信給你。</p>
              <Link to="/forgot-password" className="au-btn primary au-glow">重新申請重設密碼</Link>
            </div>
          ) : (<>
            <div className="au-head">
              <h1 className="au-h1">設定新密碼</h1>
              <p className="au-sub">請輸入新的密碼，完成後用新密碼登入。</p>
            </div>
            <form className="au-form" onSubmit={submit} noValidate>
              {field('password', 'rp1', '新密碼', '例如：Sing2026')}
              <ul className="au-rules" id="rp-rules" aria-label="密碼條件">
                {[...PW_RULES, { label: '不能和最近 3 次的密碼相同', test: () => false }].map((r, i) => {
                  const ok = i < PW_RULES.length && r.test(f.password);
                  return <li key={r.label} className={ok ? 'ok' : i >= PW_RULES.length ? 'info' : undefined}><span aria-hidden="true">{ok ? '✓' : i >= PW_RULES.length ? 'i' : '○'}</span>{r.label}
                    {i < PW_RULES.length && <span className="sr-only">{ok ? '（已符合）' : '（未符合）'}</span>}</li>;
                })}
              </ul>
              {field('confirm', 'rp2', '確認新密碼', '再輸入一次新密碼')}
              {error && <div className="notice error" role="alert"><Icon name="info" /><span>{error}</span></div>}
              <div className="au-confirm-row">
                <button className="au-btn primary au-glow au-press" disabled={busy}>{busy ? '處理中…' : '確認'}</button>
              </div>
            </form>
          </>)}
        <p className="au-foot"><Link to="/login" viewTransition>← 回到登入</Link></p>
      </div>
    </div>
  );
}
type ApiErrorLike = Error & { code?: string };
