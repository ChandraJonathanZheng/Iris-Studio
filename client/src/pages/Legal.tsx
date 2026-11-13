import { SaveButton, useSaveFlow } from '../components/SaveButton';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { fmtDate } from '../lib/date';
import { LEGAL_DOCS, legalDoc, readCookiePrefs, saveCookiePrefs, type Block } from '../lib/legal';
import { useSendPrivacyRequest } from '../lib/queries';
import type { PrivacyRequestType } from '../lib/types';
import { SiteFooter, SiteHeader } from './Landing';

/** 【待填…】 / 【待確認…】 placeholders stay visible and marked, so a draft can't pass for a finished text */
function Txt({ t }: { t: string }) {
  return <>{t.split(/(【[^】]*】)/).map((part, i) => (part.startsWith('【') ? <mark key={i} className="lg-todo">{part}</mark> : part))}</>;
}
function Body({ b }: { b: Block }) {
  return typeof b === 'string' ? <p><Txt t={b} /></p> : <ul>{b.map((li) => <li key={li}><Txt t={li} /></li>)}</ul>;
}

/** /legal/:slug — one template for every document: draft banner, version, contents, sections, open legal questions */
export function LegalPage() {
  const { slug } = useParams();
  const doc = legalDoc(slug);
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);
  if (!doc) return <Navigate to="/legal/terms" replace />;
  const reviews = doc.sections.flatMap((s) => (s.review ?? []).map((r) => ({ id: s.id, h: s.h, r })));
  return (
    <div className="site lp">
      <SiteHeader />
      <main className="lg" id="main">
        <nav className="lg-crumb" aria-label="法律與隱私文件">
          {LEGAL_DOCS.map((d) => <Link key={d.slug} to={`/legal/${d.slug}`} aria-current={d.slug === doc.slug ? 'page' : undefined} viewTransition>{d.title}</Link>)}
        </nav>
        <header className="lg-head">
          <h1>{doc.title}</h1>
          <p className="lg-meta">版本 {doc.version} · 最後更新 {doc.updated}</p>
          {/* honesty first: this is a draft until a Taiwan lawyer has reviewed it */}
          <div className="lg-draft" role="note">
            <Icon name="info" size={18} />
            <p>本文件為<b>草案</b>，尚未經臺灣執業律師審閱，不代表已符合相關法規。標示 <mark className="lg-todo">【待填】</mark> 的內容須由經營者確認後補上。</p>
          </div>
          <p className="lg-intro"><Txt t={doc.intro} /></p>
        </header>

        {doc.sections.length > 2 && (
          <nav className="lg-toc" aria-label="本頁目錄"><p>目錄</p><ol>{doc.sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.h}</a></li>)}</ol></nav>
        )}

        {doc.slug === 'privacy-request' && <PrivacyRequestForm />}

        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} className="lg-sec" aria-labelledby={`${s.id}-h`}>
            <h2 id={`${s.id}-h`}>{s.h}</h2>
            {s.body.map((b, i) => <Body key={i} b={b} />)}
          </section>
        ))}

        {doc.slug === 'cookies' && <CookiePreferences />}

        {reviews.length > 0 && (
          <aside className="lg-review" aria-labelledby="lg-review-h">
            <h2 id="lg-review-h">◆ 上線前需律師確認（{reviews.length}）</h2>
            <ol>{reviews.map((x, i) => <li key={i}><a href={`#${x.id}`}>{x.h}</a>：{x.r}</li>)}</ol>
          </aside>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

/** Cookie 設定: essential is always on (explained), optional categories default OFF and stay off until switched on */
function CookiePreferences() {
  const toast = useToast();
  const [prefs, setPrefs] = useState(() => readCookiePrefs());
  const flow = useSaveFlow();
  const [analytics, setAnalytics] = useState(prefs?.analytics ?? false);
  return (
    <section className="lg-sec lg-cookie" aria-labelledby="ck-h">
      <h2 id="ck-h">你的 Cookie 設定</h2>
      <div className="lg-ck-row">
        <div><p className="lg-ck-t">必要 Cookie</p><p className="lg-ck-s">登入與安全所需，無法關閉。</p></div>
        <span className="lg-ck-on">一律開啟</span>
      </div>
      <div className="lg-ck-row">
        <div><p className="lg-ck-t" id="ck-an">分析 Cookie</p><p className="lg-ck-s" id="ck-an-d">目前沒有使用。開啟後，日後若加入流量分析才會啟用。</p></div>
        <button className="switch" role="switch" aria-checked={analytics} aria-labelledby="ck-an" aria-describedby="ck-an-d" onClick={() => setAnalytics(!analytics)} />
      </div>
      <div className="lg-ck-foot">
        <p className="lg-ck-s">{prefs ? `上次儲存：${new Date(prefs.savedAt).toLocaleString('zh-TW')}` : '尚未儲存，非必要 Cookie 維持關閉。'}</p>
        <SaveButton state={flow.state} type="button" className="btn primary" label="儲存設定"
          onClick={() => { flow.run(() => saveCookiePrefs({ analytics }), (p) => { setPrefs(p); toast({ text: '已儲存 Cookie 設定' }); }); }} />
      </div>
    </section>
  );
}

const REQ_TYPES: { v: PrivacyRequestType; label: string; days: number }[] = [
  { v: 'access', label: '查詢或閱覽我的資料', days: 15 },
  { v: 'copy', label: '取得資料複製本', days: 15 },
  { v: 'correct', label: '補充或更正資料', days: 30 },
  { v: 'stop', label: '停止蒐集、處理或利用', days: 30 },
  { v: 'delete', label: '刪除我的資料', days: 30 },
  { v: 'withdraw', label: '撤回肖像影音或行銷同意', days: 30 },
];

/** 個人資料權利申請 — works without an account (the right isn't only for members) */
function PrivacyRequestForm() {
  const send = useSendPrivacyRequest();
  const [f, setF] = useState({ name: '', contact: '', type: '' as PrivacyRequestType | '', detail: '' });
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const errs = { name: !f.name.trim() ? '請填寫姓名。' : '', contact: !f.contact.trim() ? '請填寫 Email 或 LINE ID，方便我們確認身分。' : '', type: !f.type ? '請選擇申請項目。' : '' };
  const bad = Object.values(errs).some(Boolean);
  const err = (k: keyof typeof errs): ReactNode => (tried && errs[k] ? <p className="field-error" id={`pr-${k}-e`}>{errs[k]}</p> : null);
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (bad || !f.type) return;
    send.mutateAsync({ name: f.name, contact: f.contact, type: f.type, detail: f.detail }).then((r) => setDone(r.dueAt)).catch(() => {});
  };
  if (done) return (
    <section className="lg-form lg-done" role="status">
      <p className="lg-done-t">● 已收到你的申請</p>
      <p>我們會先以你填寫的聯絡方式確認身分，並在 <b>{fmtDate(done.slice(0, 10))}</b> 前回覆處理結果。</p>
      <button className="btn secondary" onClick={() => { setDone(null); setF({ name: '', contact: '', type: '', detail: '' }); setTried(false); }}>再送一份申請</button>
    </section>
  );
  return (
    <form className="lg-form" onSubmit={submit} noValidate aria-labelledby="pr-h">
      <h2 id="pr-h">提出申請</h2>
      <div className="field"><label htmlFor="pr-name">姓名</label>
        <input id="pr-name" placeholder="你的姓名" className="input" autoComplete="name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={tried && !!errs.name} aria-describedby="pr-name-e" />{err('name')}</div>
      <div className="field"><label htmlFor="pr-contact">聯絡方式（註冊用的 Email 或 LINE ID）</label>
        <input id="pr-contact" placeholder="例如：name@example.com 或你的 LINE ID" className="input" maxLength={120} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} aria-invalid={tried && !!errs.contact} aria-describedby="pr-contact-e" />{err('contact')}</div>
      <fieldset className="lg-types" aria-describedby="pr-type-e">
        <legend>申請項目</legend>
        {REQ_TYPES.map((t) => (
          <label key={t.v} className="lg-type"><input type="radio" name="pr-type" value={t.v} checked={f.type === t.v} onChange={() => setF({ ...f, type: t.v })} />
            <span>{t.label}<small>{t.days} 日內決定</small></span></label>))}
        {err('type')}
      </fieldset>
      <div className="field"><label htmlFor="pr-detail">說明（選填）</label>
        <textarea id="pr-detail" className="input" maxLength={1000} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} placeholder="例如：請把我的電話改成…／請刪除我 2026 年的上課照片" /></div>
      {send.isError && <div className="notice error" role="alert"><Icon name="info" /><span>{(send.error as Error).message}</span></div>}
      <button className="btn primary block" disabled={send.isPending}>{send.isPending ? '送出中…' : '送出申請'}</button>
      <p className="lg-ck-s">你填寫的資料只用於處理本次申請。</p>
    </form>
  );
}
