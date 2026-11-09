import { FOOTER_LINKS } from '../lib/legal';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../lib/api';
import { CONSULT_TIME_LABEL } from '../lib/date';
import { useSendConsult } from '../lib/queries';
import type { ConsultContactType, ConsultTime } from '../lib/types';
import { BenefitsRow, Stories, type Story } from '../components/Carousel';
import { EventCard, type StudioEvent } from '../components/EventCard';
import { Icon } from '../components/Icon';
import { Field, Photo, Segmented } from '../components/ui';

/* All photos, the bio and the stories are placeholders until Iris provides real, consented content (WEB-8). */
const BENEFITS = [
  { title: '從呼吸開始', body: '先學會放鬆地呼吸與發聲，聲音才會穩，也不容易累。' },
  { title: '配合你的步調', body: '一對一，依你的目標（興趣、考試、表演）安排曲目與練習。' },
  { title: '唱出自己的聲音', body: '不是唱得更像別人，而是更自在地唱成自己。' },
];
const STORIES: Story[] = [
  { initials: '小', who: '小明（示意）', text: '以前一緊張高音就破掉，現在站上台也敢放開唱。' },
  { initials: '佳', who: '佳穎（示意）', text: '老師會先問我想唱什麼，上課不再是壓力，而是期待。' },
  { initials: '雅', who: '雅婷（示意）', text: '呼吸對了之後，連說話都變得比較有力氣。' },
];
const EVENTS: StudioEvent[] = [
  { title: '學員小型發表會', date: '2026/06/14（日）', photos: ['發表會合照', '彩排', '後台', '謝幕', '大合唱'] },
];

const NAV = [['about', '關於 Iris'], ['benefits', '怎麼上課'], ['stories', '學員心聲'], ['events', '活動']] as const;

export function Landing() {
  return (
    <>
      <SiteHeader home />
      <main>
        <section className="l-sec hero-l" style={{ paddingTop: 32 }}>
          <div>
            <h1>找到屬於你的聲音</h1>
            <p className="lead">不是唱得更像別人，而是更自在地唱成自己。</p>
            <div className="row wrap" style={{ marginTop: 20 }}>
              <Link className="btn primary" to="/consult">免費諮詢</Link>
              <a className="btn secondary" href="#benefits">看看怎麼上課 ↓</a>
            </div>
          </div>
          <Photo caption="Iris 與學生上課" />
        </section>

        <section className="l-sec" style={{ paddingTop: 32 }} aria-label="重點">
          <div className="trust">
            <div><b>[N] 年</b>教學經驗</div><div><b>1 對 1</b>每堂 1 小時</div><div><b>3 種</b>曲風</div>
          </div>
        </section>

        <section id="about" className="l-sec about">
          <Photo caption="Iris 肖像" style={{ aspectRatio: '4 / 5' }} />
          <div className="stack s4">
            <p className="over">關於 Iris</p><h2 className="h2">一對一，陪你慢慢唱開</h2>
            <p>Iris 是一位聲樂老師，專注在呼吸、發聲到舞台表現。（簡介文字待 Iris 提供）</p>
            <p>不論你是第一次開口唱，還是想準備表演或考試，都可以先免費聊聊。</p>
          </div>
        </section>

        <section id="benefits" className="l-sec stack s4"><p className="over">怎麼上課</p><h2 className="h2">三個讓你更自在的重點</h2><BenefitsRow items={BENEFITS} /></section>
        <section id="stories" className="l-sec stack s4"><p className="over">學員心聲</p><h2 className="h2">他們這樣說</h2><Stories stories={STORIES} /></section>
        <section id="events" className="l-sec stack s4"><p className="over">工作室活動</p>{EVENTS.map((e) => <EventCard key={e.title} event={e} />)}</section>

        <section className="cta-band"><div className="in">
          <h2 className="h2">還不確定從哪裡開始？</h2><p className="sub">免費聊 15 分鐘，說說你想唱什麼。</p>
          <Link className="btn primary" to="/consult">免費諮詢</Link>
          <p className="cap">沒有壓力，不會硬性推銷。</p>
          <Link to="/login" className="btn link">已經是學員？登入</Link>
        </div></section>
      </main>
      <SiteFooter />
    </>
  );
}

export function SiteHeader({ home }: { home?: boolean }) {
  return (
      <header className="l-nav frosted">
        <div className="in">
          <Link to="/" className="logo">Iris Studio</Link>
          <nav className="links" aria-label="頁面">{NAV.map(([id, t]) => <a key={id} href={home ? `#${id}` : `/#${id}`}>{t}</a>)}</nav>
          <div className="end"><Link className="btn link" to="/login">登入</Link><Link className="btn primary sm" to="/consult">免費諮詢</Link></div>
        </div>
      </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="foot ft">
      <div className="ft-card">
        <p className="ft-brand"><b>IRIS</b><span>聲樂工作室</span></p>
        <p className="ft-tag">陪你找到自己的聲音。</p>
        <nav className="ft-cols" aria-label="服務與隱私資訊">
          <div><h2 className="ft-h">服務資訊</h2><ul>{FOOTER_LINKS.service.map((l) => <li key={l.to}><Link to={l.to} viewTransition>{l.label}</Link></li>)}</ul></div>
          <div><h2 className="ft-h">隱私與權益</h2><ul>{FOOTER_LINKS.privacy.map((l) => <li key={l.to}><Link to={l.to} viewTransition>{l.label}</Link></li>)}</ul></div>
        </nav>
        <p className="ft-small">© 2026 IRIS Studio. All rights reserved.</p>
        {/* no real address yet: shown as an open item instead of a made-up one */}
        <p className="ft-small">個人資料保護聯絡窗口：<span className="ft-todo">【待填：正式聯絡信箱】</span></p>
      </div>
    </footer>
  );
}

/** Soft still life: tea cup with a music note, a vase of flowers, a sheet of music. */
function ConsultArt() {
  return (
    <svg className="cs-art" viewBox="0 0 260 200" aria-hidden="true" focusable="false">
      <ellipse cx="130" cy="176" rx="112" ry="12" fill="#E6DFD0" opacity=".6" />
      <rect x="96" y="140" width="150" height="34" rx="3" transform="rotate(-6 96 140)" fill="#F4ECD9" stroke="#E2D6BC" />
      {[148, 156, 164].map((y) => <line key={y} x1="112" x2="228" y1={y} y2={y - 7} stroke="#CFC3A6" strokeWidth=".8" />)}
      <path d="M156 70 L150 36 M160 70 L178 30 M164 72 L196 44 M156 70 L132 44" stroke="#C8B98B" strokeWidth="1.4" fill="none" />
      {[[150, 36], [178, 30], [196, 44], [132, 44], [166, 52], [144, 56]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="5" fill="#F6E7D4" stroke="#E3C9A8" />)}
      <path d="M180 100 C200 70 226 66 238 56 C236 84 214 102 180 100Z" fill="#9DAE8A" />
      <path d="M182 110 C204 96 224 100 238 92 C230 116 206 122 182 110Z" fill="#7E9570" />
      <path d="M146 70 h30 l-5 52 a10 10 0 0 1 -10 9 h0 a10 10 0 0 1 -10 -9z" fill="#fff" opacity=".7" stroke="#D9DED2" />
      <path d="M36 112 h92 v30 a30 30 0 0 1 -30 30 h-32 a30 30 0 0 1 -30 -30z" fill="#F5EEDD" stroke="#CDBF9B" />
      <path d="M36 120 q-22 2 -22 22 q0 18 24 18" fill="none" stroke="#CDBF9B" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="82" cy="112" rx="46" ry="7" fill="#B98E5E" />
      <text x="72" y="156" fontSize="26" fill="#7E9570">♪</text>
    </svg>
  );
}

const TIMES = Object.keys(CONSULT_TIME_LABEL) as ConsultTime[];

/** /consult (WEB-7): name, contact (LINE / Email), preferred time window, optional topic. */
export function ConsultPage() {
  const send = useSendConsult();
  const [name, setName] = useState(''); const [type, setType] = useState<ConsultContactType>('line');
  const [contact, setContact] = useState(''); const [time, setTime] = useState<ConsultTime>('any'); const [topic, setTopic] = useState('');
  const [tried, setTried] = useState(false); const [done, setDone] = useState<{ type: ConsultContactType; time: ConsultTime } | null>(null);

  const emailBad = type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.trim());
  const errs = { name: name.trim() ? '' : '請填寫名字。', contact: !contact.trim() ? '請填寫聯絡方式。' : emailBad ? '請填寫正確的 Email。' : '' };

  const submit = (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (errs.name || errs.contact) return;
    send.mutate({ name: name.trim(), contactType: type, contact: contact.trim(), preferredTime: time, topic: topic.trim() }, { onSuccess: () => setDone({ type, time }) });
  };

  return (
    <div className="auth"><div className="card">
      <Link to="/" className="btn link" style={{ alignSelf: 'flex-start' }}><Icon name="back" size={18} />回首頁</Link>
      {done ? (
        <div className="cs-done">
          <div className="cs-hero">
            <div className="stack s2">
              <h1 className="cs-title">收到你的訊息了，<br />謝謝你！<Icon name="sparkle" size={28} /></h1>
              <p className="cs-lead">很開心你想和 Iris 聊聊唱歌的事。<br />我會透過 {done.type === 'line' ? 'LINE' : 'Email'} 與你聯絡，<br />一起確認方便的諮詢時間。</p>
            </div>
            <ConsultArt />
          </div>
          <div className="cs-next"><b>接下來</b><span>確認時間 → 免費聊 15 分鐘</span></div>
          <p className="caption">偏好聯絡時間：{CONSULT_TIME_LABEL[done.time]}</p>
          <Link className="btn primary block" to="/">返回首頁</Link>
        </div>
      ) : (
        <>
          <ol className="journey" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {['留下聯絡方式', 'Iris 聯絡你', '免費聊 15 分鐘'].map((t, i) => <li key={t} className={`st${i === 0 ? ' on' : ''}`}><i />{t}</li>)}
          </ol>
          <div className="stack s2"><h1 className="h1" style={{ fontSize: 28, lineHeight: '36px' }}>免費諮詢</h1><p className="sub">告訴 Iris 怎麼聯絡你，她會主動找你聊。</p></div>
          <form className="stack s4" onSubmit={submit} noValidate>
            <Field id="c-name" label="名字" error={tried ? errs.name : ''}>
              <input id="c-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={(tried && !!errs.name) || undefined} aria-describedby={tried && errs.name ? 'c-name-err' : undefined} />
            </Field>
            <div className="stack s2">
              <Segmented label="聯絡方式" value={type} onChange={(v) => { setType(v); setContact(''); }} options={[{ value: 'line', label: 'LINE' }, { value: 'email', label: 'Email' }]} />
              <Field id="c-contact" label={type === 'line' ? 'LINE ID' : 'Email'} error={tried ? errs.contact : ''}>
                <input id="c-contact" className="input" type={type === 'email' ? 'email' : 'text'} inputMode={type === 'email' ? 'email' : 'text'} autoComplete={type === 'email' ? 'email' : 'off'}
                  value={contact} onChange={(e) => setContact(e.target.value)} aria-invalid={(tried && !!errs.contact) || undefined} aria-describedby={tried && errs.contact ? 'c-contact-err' : undefined} />
              </Field>
            </div>
            <div className="stack s2" role="radiogroup" aria-label="方便聯絡的時間">
              <span className="label">方便聯絡的時間</span>
              <div className="chips" style={{ flexWrap: 'wrap' }}>{TIMES.map((t) => <button key={t} type="button" role="radio" aria-checked={time === t} className="chip choice" onClick={() => setTime(t)}>{CONSULT_TIME_LABEL[t]}</button>)}</div>
            </div>
            <Field id="c-topic" label="想聊什麼？（選填）"><textarea id="c-topic" className="textarea" value={topic} maxLength={1000} onChange={(e) => setTopic(e.target.value)} /></Field>
            {send.isError && <p className="err" role="alert">{send.error instanceof ApiError ? send.error.message : '送出失敗，請再試一次。'}</p>}
            <button className="btn primary block" disabled={send.isPending}>和 Iris 聊聊</button>
          </form>
        </>
      )}
    </div></div>
  );
}
