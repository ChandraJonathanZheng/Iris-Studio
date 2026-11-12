import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { qk, useLogout, useMe } from '../lib/queries';
import type { ConsentInput, Me } from '../lib/types';
import { Icon } from '../components/Icon';
import { Field, PasswordInput } from '../components/ui';

import { PasswordRules } from '../components/PasswordRules';
import { passwordProblem } from '../lib/password';
import { emailProblem, useEmailError } from '../lib/useEmailError';
import { CONSENT_TEXT, CONSENT_VERSION } from '../lib/legal';
const PENDING_CONSENT = 'iris-pending-consent';

const DEMO = import.meta.env.MODE === 'mock' || import.meta.env.MODE === 'proto';
const homeFor = (m: Me) => (m.status === 'Pending' ? '/pending' : m.role === 'Teacher' ? '/teacher' : '/app');


/** One place that turns an API answer into a signed-in session and a destination. */
function useEnter() {
  const qc = useQueryClient();
  const nav = useNavigate();
  return async () => {
    const m = await api.get<Me | null>('/api/me');
    if (!m) throw new ApiError(401, 'session_missing', '登入狀態未能儲存，請允許此網站使用 Cookie 後重新登入。');
    qc.setQueryData(qk.me, m);
    nav(homeFor(m), { replace: true });
  };
}

/** Already signed in → straight to your home (also covers the browser Back button after login). */
function useRedirectIfSignedIn() {
  const me = useMe();
  return me.data ? <Navigate to={homeFor(me.data)} replace /> : null;
}

function LineButton({ label, register, consents, beforeStart }: { label: string; register?: boolean; consents?: ConsentInput; beforeStart?: () => boolean }) {
  const enter = useEnter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const click = async () => {
    if (beforeStart && !beforeStart()) return;
    if (!DEMO) {
      if (register && consents) { try { sessionStorage.setItem(PENDING_CONSENT, JSON.stringify(consents)); } catch { /* storage unavailable */ } }
      window.location.href = register ? '/api/auth/line?returnUrl=%2Fpending' : '/api/auth/line?returnUrl=%2Fapp'; return;
    }
    setBusy(true); setError('');
    try {
      if (register) await api.post('/api/auth/line/mock-register');
      else await api.post('/api/auth/line/mock', { as: 's1' });
      if (register && consents) await api.post('/api/me/consents', consents);
      await enter();
    }
    catch (e) { setError(e instanceof ApiError ? e.message : '登入失敗'); setBusy(false); }
  };
  return (
    <>
      <button className="btn primary block line-btn" onClick={click} disabled={busy}><span className="line-mark" aria-hidden>LINE</span>{label}</button>
      {error && <p className="err" role="alert">{error}</p>}
    </>
  );
}

export function Login() {
  const [search] = useSearchParams();
  const lineError = ({
    line: 'LINE 登入未完成，請重新登入。若持續發生，請聯絡工作室。',
    line_session: '登入驗證已過期或 Cookie 遺失，請從同一個網站重新按 LINE 登入。',
    declined: '此帳號目前無法登入，請聯絡工作室。',
  } as Record<string, string>)[search.get('error') ?? ''];
  const redirect = useRedirectIfSignedIn();
  const enter = useEnter();
  const [email, setEmail] = useState(() => (search.get('email') ?? '').slice(0, 200)); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const emailError = useEmailError(email, tried);

  const submit = async (e?: FormEvent, creds = { email, password }) => {
    e?.preventDefault();
    if (e) { setTried(true); if (emailProblem(email) || !password) { document.getElementById(emailProblem(email) ? 'email' : 'password')?.focus(); return; } }
    if (busy) return;
    setBusy(true); setError('');
    try { await api.post('/api/auth/login', creds); await enter(); }
    catch (err) { setError(err instanceof ApiError ? err.message : '登入失敗，請再試一次。'); setBusy(false); }
  };
  if (redirect) return redirect;

  return (
    <main className="auth pw-done-wrap" aria-labelledby="login-title"><div className="pw-done login-card">
      <div className="login-head">
        <Link to="/" className="pw-done-brand">IRIS STUDIO</Link>
        <span className="pw-done-rule" aria-hidden="true" />
        <span className="pw-done-mark" aria-hidden="true"><Icon name="user" size={34} /></span>
        <h1 className="pw-done-title" id="login-title">歡迎回來</h1>
        <p className="pw-done-lead fp-lead">登入後可以預約課程、查看堂數，<br />繼續你的學習旅程。</p>
      </div>
      {lineError && <p className="err" role="alert">{lineError}</p>}
      {search.get('reset') === 'success' && <p className="info" role="status">密碼已更新，請使用新密碼登入。</p>}
      <form className="stack" onSubmit={submit} noValidate aria-busy={busy}>
        <Field id="email" label="Email" required error={emailError}>
          <input id="email" className="input" type="email" required placeholder="you@example.com" maxLength={200} autoComplete="email" inputMode="email" disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!emailError || undefined} aria-describedby={emailError ? 'email-err' : undefined} />
        </Field>
        <Field id="password" label="密碼" required error={tried && !password ? '密碼不能空白。' : undefined}>
          <PasswordInput id="password" value={password} onChange={setPassword} required disabled={busy} invalid={tried && !password} describedBy={tried && !password ? 'password-err' : undefined} />
        </Field>
        <Link className="auth-forgot" to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}>忘記密碼？</Link>
        {error && <p id="login-err" className="err" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? '處理中…' : '登入'}</button>
      </form>
      <div className="auth-divider">其他</div>
      <div className="auth-alternatives"><LineButton label="LINE 登入" /><button type="button" className="btn secondary" onClick={() => document.getElementById('email')?.focus()}><span aria-hidden>師</span>老師登入</button></div>
      <Link className="fp-link" to="/register">建立帳號<Icon name="arrow" size={18} /></Link>
      {DEMO && (
        <div className="info stack s2" aria-label="示範帳號">
          <b>示範帳號</b>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn secondary sm" onClick={() => submit(undefined, { email: 'xiaoming@demo.local', password: 'demo1234' })}>學生：王小明</button>
            <button className="btn secondary sm" onClick={() => submit(undefined, { email: 'sihan@demo.local', password: 'demo1234' })}>堂數用完：李思涵</button>
            <button className="btn secondary sm" onClick={() => submit(undefined, { email: 'iris@studio.local', password: 'change-me-now' })}>老師：Iris</button>
          </div>
        </div>
      )}
    </div></main>
  );
}

function Journey({ step }: { step: 0 | 1 | 2 }) {
  return (
    <ol className="journey" style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="註冊流程">
      {['建立帳號', 'Iris 確認', '開始預約'].map((t, i) => (
        <li key={t} className={`st${i <= step ? ' on' : ''}`} aria-current={i === step ? 'step' : undefined}><i />{t}</li>
      ))}
    </ol>
  );
}

export function Register() {
  const redirect = useRedirectIfSignedIn();
  const enter = useEnter();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState('');
  const emailError = useEmailError(email, tried);
  // consents: terms required; media + marketing optional and UNchecked; a minor needs a guardian
  const [c, setC] = useState({ terms: false, media: false, marketing: false, minor: false, gName: '', gRel: '', gContact: '', gAgree: false });

  const consentErr = !c.terms ? '請閱讀並勾選同意服務條款與隱私權政策。'
    : c.minor && (!c.gName.trim() || !c.gRel.trim() || !c.gContact.trim() || !c.gAgree) ? '未滿 18 歲，請填寫法定代理人資料並由法定代理人勾選同意。' : '';
  const consents = (): ConsentInput => ({ version: CONSENT_VERSION, terms: c.terms, media: c.media, marketing: c.marketing, minor: c.minor,
    guardian: c.minor ? { name: c.gName.trim(), relation: c.gRel.trim(), contact: c.gContact.trim(), agreed: c.gAgree } : null });

  const errs = { email: emailProblem(email), name: name.trim() ? '' : '姓名不能空白。', password: passwordProblem(password), again: !again ? '確認密碼不能空白。' : again !== password ? '兩次輸入的密碼不一樣。' : '' };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setTried(true); setError('');
    const first = (['email', 'name', 'password', 'again'] as const).find((key) => errs[key]);
    if (first || consentErr) { document.getElementById(first ? ({ email: 'reg-email', name: 'name', password: 'reg-pw', again: 'reg-again' })[first] : !c.terms ? 'terms' : !c.gName.trim() ? 'g-name' : !c.gRel ? 'g-rel' : 'g-contact')?.focus(); return; }
    if (busy) return;
    setBusy(true);
    try { await api.post('/api/auth/register', { name: name.trim(), email: email.trim(), phone: null, password, consents: consents() }); await enter(); }
    catch (err) { setError(err instanceof ApiError ? err.message : '註冊失敗，請再試一次。'); setBusy(false); }
  };
  if (redirect) return redirect;
  return <main className="auth"><div className="card register-card">
    <Journey step={0} /><h1 className="h1">建立帳號</h1><p className="sub">送出後由 Iris 確認，通過就能開始預約。</p>
    <form className="stack" onSubmit={submit} noValidate aria-busy={busy}>
      <Field id="reg-email" label="Email" required error={emailError}>
        <input id="reg-email" className="input" type="email" required placeholder="you@example.com" maxLength={200} autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!emailError || undefined} aria-describedby={emailError ? 'reg-email-err' : undefined} disabled={busy} />
      </Field>
      <Field id="name" label="姓名" required error={tried ? errs.name : ''}>
        <input id="name" className="input" required placeholder="例如：王小明" maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={tried && !!errs.name || undefined} aria-describedby={tried && errs.name ? 'name-err' : undefined} disabled={busy} />
      </Field>
      <Field id="reg-pw" label="密碼" required error={tried ? errs.password : ''}>
        <PasswordInput id="reg-pw" value={password} onChange={setPassword} required autoComplete="new-password" placeholder="例如：IrisVoice2026" disabled={busy} invalid={tried && !!errs.password} describedBy={tried && errs.password ? 'reg-pw-err' : undefined} />
      </Field>
      <PasswordRules value={password} />
      <Field id="reg-again" label="確認密碼" required error={tried || again ? errs.again : ''}>
        <PasswordInput id="reg-again" value={again} onChange={setAgain} required autoComplete="new-password" placeholder="再次輸入密碼" disabled={busy} invalid={(tried || !!again) && !!errs.again} describedBy={(tried || again) && errs.again ? 'reg-again-err' : undefined} />
      </Field>
        <fieldset className="au-consent" aria-describedby={tried && consentErr ? "consent-err" : undefined}>
          <legend>開始之前</legend>
          <label className="au-ck req"><input id="terms" type="checkbox" checked={c.terms} onChange={(e) => setC({ ...c, terms: e.target.checked })} aria-invalid={tried && !c.terms} />
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
              <div className="field"><label htmlFor="g-name">法定代理人姓名<span className="required"> *</span></label><input id="g-name" className="input" required placeholder="例如：王美玲" autoComplete="off" value={c.gName} onChange={(e) => setC({ ...c, gName: e.target.value })} /></div>
              <div className="field"><label htmlFor="g-rel">關係</label>
                <select id="g-rel" className="input" required value={c.gRel} onChange={(e) => setC({ ...c, gRel: e.target.value })}><option value="">請選擇</option><option>父親</option><option>母親</option><option>監護人</option></select></div>
              <div className="field"><label htmlFor="g-contact">法定代理人聯絡方式（電話或 Email）</label><input id="g-contact" className="input" required placeholder="例如：0912-345-678" autoComplete="off" value={c.gContact} onChange={(e) => setC({ ...c, gContact: e.target.value })} /></div>
              <label className="au-ck req"><input type="checkbox" checked={c.gAgree} onChange={(e) => setC({ ...c, gAgree: e.target.checked })} />
                <span>{CONSENT_TEXT.guardian}<em>（請由法定代理人勾選）</em></span></label>
            </div>
          )}
          {tried && consentErr && <p className="field-error" id="consent-err">{consentErr}</p>}
        </fieldset>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? '處理中…' : '建立帳號'}</button>
    </form>
    <p className="cap">已經有帳號？<Link to="/login">登入</Link></p>
  </div></main>;
}

/** Pending applicants see only this. It polls /api/me every 10 s and enters the app once Iris approves (AUTH-3). */
export function Pending() {
  const me = useMe();
  const qc = useQueryClient();
  const logout = useLogout();
  const nav = useNavigate();
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

  if (me.isPending) return <div className="auth" aria-busy />;
  if (!me.data) return <Navigate to="/login" replace />;
  if (me.data.status === 'Active') return <Navigate to={homeFor(me.data)} replace />;

  return (
    <div className="auth"><div className="card" style={{ textAlign: 'center', alignItems: 'center' }}>
      <Journey step={1} />
      <span className="avatar s56" style={{ background: 'var(--sage-tint)' }}><Icon name="clock" size={28} /></span>
      <div className="stack s2"><h1 className="h1" style={{ fontSize: 28, lineHeight: '36px' }}>等待 Iris 確認</h1>
        <p className="sub">{me.data.name}，你的申請已送出。Iris 確認後會自動進入預約畫面，不用重新登入。</p></div>
      <button className="btn link" onClick={() => { nav('/login'); logout.mutate(); }}>不是 {me.data.name}？切換帳號</button>
    </div></div>
  );
}
