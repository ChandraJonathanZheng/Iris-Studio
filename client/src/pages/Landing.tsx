import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { Photo } from '../components/ui';
import { CONSULT_TIME_LABEL } from '../lib/date';
import { useSendConsult } from '../lib/queries';

/**
 * Public landing page. It is the same for every visitor, so `npm run build` pre-renders it to static HTML (#7):
 * the text is visible before any JavaScript runs, which helps first paint and search engines.
 * Bracketed text = placeholders until Iris provides real content (and real, consented testimonials).
 */
// SAMPLE text only, to show the layout with realistic Chinese lengths. Replace with real, consented testimonials before launch.
const SAMPLE_VOICES = [
  { name: '陳小姐', job: '上班族', time: '學了 6 個月', quote: '以前唱高音一定破音，現在知道怎麼用氣息支撐，KTV 終於敢點自己喜歡的歌了。' },
  { name: '林先生', job: '準備婚禮獻唱', time: '學了 3 個月', quote: 'Iris 幫我把一首歌拆成小段慢慢練，婚禮當天很穩，太太和家人都很感動。' },
  { name: '黃媽媽', job: '孩子國小五年級', time: '學了 1 年', quote: '孩子本來很怕上台，現在每次成果發表會都很期待，自信心進步很多。' },
];

// SAMPLE events. Each keeps 7 photo slots; the page shows 1 featured + 2 thumbnails, the rest behind 查看更多照片.
const pics = (name: string) => Array.from({ length: 7 }, (_, i) => ({ caption: `${name} 照片 ${i + 1}` }));
type LpEvent = { title: string; date: string; place: string; summary: string; photos: { caption: string; src?: string; lqip?: string }[] };
const SAMPLE_EVENTS: LpEvent[] = [
  { title: '秋季小型發表會', date: '2026/10/18（六）', place: '[場地名稱]', summary: '學生們第一次在親友面前完整演唱一首歌，從流行歌到音樂劇選曲，每個人都很勇敢。', photos: pics('秋季發表會') },
  { title: '夏日聲樂工作坊', date: '2026/07/26（六）', place: 'Iris Studio A 教室', summary: '半天的呼吸與共鳴密集練習，最後大家一起合唱了一首歌。', photos: pics('夏日工作坊') },
];

const BENEFITS = [
  { icon: 'mic', title: '把基礎打穩', text: '呼吸、發聲、音準和換聲區，一步一步練到身體記得。', note: '一對一 · 每堂 1 小時' },
  { icon: 'music', title: '唱你真正想唱的歌', text: '練習從你喜歡的歌開始設計，技巧直接用在歌裡。', note: '流行 · 音樂劇 · 古典' },
  { icon: 'star', title: '準備重要的舞台', text: '婚禮獻唱、比賽、試鏡前的密集練習，還有工作室發表會。', note: '可和一般課程一起安排' },
];

export function Landing() {
  return (
    <div className="site lp">
      <SiteHeader home />

      {/* 1. Hero — the message comes first; the photo supports it (text never sits on the photo, so contrast never depends on it) */}
      <section id="hero" className="lp-hero" aria-labelledby="hero-t">
        <div className="lp-hero-text">
          <p className="lp-eyebrow">Iris Studio · 聲樂工作室</p>
          <h1 className="lp-h1" id="hero-t">找到屬於你的聲音</h1>
          <p className="lp-sub">不是唱得更像別人，而是更自在地唱成自己。</p>
          <div className="lp-ctas">
            <Link to="/consult" className="btn primary lp-btn" viewTransition>免費諮詢</Link>
            <a href="#benefits" className="lp-textlink">看看怎麼上課 <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <div className="lp-hero-photo"><Photo caption="照片：Iris 陪學生練唱的瞬間（4:3）" /></div>
      </section>

      {/* 2. Trust strip */}
      <section className="lp-trust" aria-label="工作室重點">
        <div><b>[N] 年</b><span>教學經驗</span></div>
        <div><b>1 對 1</b><span>每堂 1 小時</span></div>
        <div><b>3 種曲風</b><span>流行·音樂劇·古典</span></div>
      </section>

      {/* 3. About — 2 short paragraphs */}
      <section id="about" className="lp-sec lp-about" aria-labelledby="about-t">
        <div className="lp-about-photo"><Photo caption="照片：Iris 個人照（3:4）" /></div>
        <div className="lp-about-text">
          <p className="lp-over">關於 Iris</p>
          <h2 className="lp-h2" id="about-t">你好，我是 Iris</h2>
          {/* SAMPLE bio — replace with Iris's own words */}
          <p className="lp-p">我從小在教會詩班長大，大學主修聲樂。站上不同的舞台後才發現，比起自己唱，我更喜歡陪別人找到自己的聲音。這幾年的學生從八歲到六十幾歲都有，每個人來上課的原因都不一樣。</p>
          <p className="lp-p">所以第一堂課，我會先聽你唱一首喜歡的歌，了解你的音色、呼吸和最舒服的音域，再一起決定要往哪裡練。很多人覺得自己「五音不全」，其實只是還沒找到用對身體的方法。</p>
        </div>
      </section>

      {/* 4. Benefits — 3 compact cards */}
      <section id="benefits" className="lp-sec" aria-labelledby="ben-t">
        <p className="lp-over">課程內容</p>
        <h2 className="lp-h2" id="ben-t">Iris 可以幫你什麼</h2>
        <BenefitSwipe />
        <p className="lp-price">4 堂 NT$ 3,200 · 8 堂 NT$ 6,200 · 用 LINE 登入自己預約時間</p>
      </section>

      {/* 5. Student stories — editorial */}
      <section id="voices" className="lp-sec" aria-labelledby="voi-t">
        <p className="lp-over">學生心得</p>
        <h2 className="lp-h2" id="voi-t">學生怎麼說</h2>
        <VoiceStage />
        <p className="lp-note">[示範文字：上線前請換成真實學生的心得，並先取得本人同意。]</p>
      </section>

      {/* 6. Studio events */}
      <section id="events" className="lp-sec" aria-labelledby="evt-t">
        <p className="lp-over">Iris Studio Event</p>
        <h2 className="lp-h2" id="evt-t">工作室活動</h2>
        <div className="lp-events">{SAMPLE_EVENTS.map((ev) => <EventBlock key={ev.title} ev={ev} />)}</div>
      </section>

      {/* 7. Final CTA */}
      <section id="cta" className="lp-final" aria-labelledby="cta-t">
        <h2 className="lp-h2" id="cta-t">還不確定從哪裡開始？</h2>
        <p className="lp-sub">先聊聊你現在的聲音，和你想唱到哪裡。</p>
        <Link to="/consult" className="btn primary lp-btn" viewTransition>免費聊 15 分鐘</Link>
        <p className="lp-cap">沒有壓力，也不用先決定要不要上課。</p>
        <p className="lp-cap lp-student">已經是學生了？<Link to="/login" viewTransition>用 LINE 登入</Link></p>
      </section>

      <SiteFooter />
    </div>
  );
}

/**
 * 學生怎麼說 as a "lyrics" stage — fitting for a singing studio:
 *  • one story at a time; its words rise in one by one like karaoke lyrics (blur → sharp, staggered per character);
 *  • a slim progress line is the timer for the next story (7 s);
 *  • autoplay pauses on hover, focus or touch, and has a visible ⏸ (WCAG 2.2.2: anything moving > 5 s needs a pause);
 *  • swipe or ← → to change; initials act as tabs.
 * Reduced motion: no stagger, no autoplay — just a quiet cross-fade.
 */
function VoiceStage() {
  const n = SAMPLE_VOICES.length;
  const [i, setI] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hold, setHold] = useState(false); // hover / focus / finger on it
  const [reduce] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const playing = !reduce && !userPaused && !hold;
  const go = (d: number) => setI((x) => (x + d + n) % n);
  const startX = useRef<number | null>(null);
  const v = SAMPLE_VOICES[i];
  return (
    <div className={`vs${reduce ? ' still' : ''}`} role="group" aria-roledescription="輪播" aria-label="學生心得"
      onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHold(false); }}
      onPointerDown={(e) => { startX.current = e.clientX; setHold(true); }}
      onPointerUp={(e) => { if (startX.current !== null && Math.abs(e.clientX - startX.current) > 40) go(e.clientX < startX.current ? 1 : -1); startX.current = null; setHold(false); }}
      onPointerCancel={() => { startX.current = null; setHold(false); }}
      onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }}>
      <figure className="vs-card" key={i} aria-live={playing ? 'off' : 'polite'}>
        <span className="vs-qmark" aria-hidden="true">“</span>
        <blockquote>
          <span className="sr-only">{v.quote}</span>
          <span aria-hidden="true">{Array.from(v.quote).map((ch, k) => <span key={k} className="vs-ch" style={{ '--k': k } as React.CSSProperties}>{ch}</span>)}</span>
        </blockquote>
        <figcaption><span className="vs-av" aria-hidden="true">{v.name.slice(0, 1)}</span><span><b>{v.name}</b><small>{v.job} · {v.time}</small></span></figcaption>
      </figure>
      {/* a slim line is the timer for the next story (no visible "voice note" waveform) */}
      <div className={`vs-progress${playing ? '' : ' paused'}`} key={`p${i}`} aria-hidden="true"><span onAnimationEnd={() => go(1)} /></div>
      <div className="vs-ctrl">
        <div className="vs-who" role="tablist" aria-label="選擇學生">
          {SAMPLE_VOICES.map((x, k) => (
            <button key={x.name} role="tab" aria-selected={k === i} aria-label={`${x.name}的心得`} onClick={() => setI(k)}>{x.name.slice(0, 1)}</button>))}
        </div>
        <div className="vs-nav">
          <button className="vs-btn" aria-label="上一則" onClick={() => go(-1)}><Icon name="back" size={18} /></button>
          {!reduce && <button className="vs-btn" aria-label={userPaused ? '繼續播放' : '暫停輪播'} onClick={() => setUserPaused(!userPaused)}><Icon name={userPaused ? 'play' : 'pause'} size={18} weight="fill" /></button>}
          <button className="vs-btn" aria-label="下一則" onClick={() => go(1)}><Icon name="chev" size={18} /></button>
        </div>
      </div>
    </div>
  );
}

/**
 * Benefits on phones: a swipe row (cards snap into place, the next one "peeks" in from the right so it's obvious
 * there's more) with page dots. No autoplay — people read these, and moving text is hard to read.
 * On wider screens the same list is a plain 3-column grid (CSS), so nothing is hidden.
 */
function BenefitSwipe() {
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const el = track.current; if (!el) return;
    const cards = [...el.children] as HTMLElement[];
    // whichever card is most visible is the "current" one → drives the dots and the soft focus effect
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting && e.intersectionRatio > 0.6) setActive(cards.indexOf(e.target as HTMLElement)); });
    }, { root: el, threshold: [0.6] });
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);
  const goTo = (i: number) => {
    const el = track.current; const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft - 20, behavior: reduce ? 'auto' : 'smooth' });
  };
  return (
    <div className="lp-swipe">
      <ul className="lp-benefits" ref={track} tabIndex={0} aria-label="課程內容，可左右滑動">
        {BENEFITS.map((b, i) => (
          <li key={b.title} className={i === active ? 'is-active' : ''} aria-label={`${i + 1} / ${BENEFITS.length}`}>
            <span className="lp-ico" aria-hidden="true"><Icon name={b.icon} size={20} /></span>
            <h3>{b.title}</h3>
            <p>{b.text}</p>
            <small>{b.note}</small>
          </li>))}
      </ul>
      <div className="lp-dots" role="group" aria-label="切換課程內容">
        {BENEFITS.map((b, i) => (
          <button key={b.title} aria-label={`第 ${i + 1} 張：${b.title}`} aria-current={i === active ? 'true' : undefined} onClick={() => goTo(i)} />))}
      </div>
    </div>
  );
}

/** One event: 1 featured photo + 2 thumbnails; the rest open with 查看更多照片. */
function EventBlock({ ev }: { ev: LpEvent }) {
  const [more, setMore] = useState(false);
  const id = `ev-more-${ev.title}`;
  const rest = ev.photos.slice(3);
  return (
    <article className="lp-event" aria-labelledby={`${id}-t`}>
      <div className="lp-ev-photos">
        <div className="lp-ev-main"><Photo {...ev.photos[0]} /></div>
        <div className="lp-ev-thumb"><Photo {...ev.photos[1]} /></div>
        <div className="lp-ev-thumb"><Photo {...ev.photos[2]} /></div>
      </div>
      {more && <div className="lp-ev-more" id={id}>{rest.map((p) => <div className="lp-ev-thumb" key={p.caption}><Photo {...p} /></div>)}</div>}
      <div className="lp-ev-text">
        <p className="lp-ev-meta">{ev.date} · {ev.place}</p>
        <h3 id={`${id}-t`}>{ev.title}</h3>
        <p>{ev.summary}</p>
        {rest.length > 0 && <button className="lp-textlink" aria-expanded={more} aria-controls={id} onClick={() => setMore(!more)}>{more ? '收起照片' : `查看更多照片（${rest.length}）`}</button>}
      </div>
    </article>
  );
}

/** Site top bar. 免費諮詢 is the primary action, 登入 the quiet secondary one. */
function SiteHeader({ home }: { home?: boolean }) {
  return (
    <header className="topbar lp-bar">
      {home ? <a href="#hero" className="brand" aria-label="Iris 聲樂工作室 首頁"><b>IRIS</b><span>聲樂教練</span></a>
        : <Link to="/" className="brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition><b>IRIS</b><span>聲樂教練</span></Link>}
      <nav aria-label="頁面導覽">
        {home ? <><a href="#about">關於 Iris</a><a href="#benefits">課程內容</a><a href="#voices">學生心得</a><a href="#events">活動</a></>
          : <Link to="/" viewTransition>回首頁</Link>}
      </nav>
      <Link to="/login" className="lp-bar-login" viewTransition>登入</Link>
      <Link to="/consult" className="btn primary lp-bar-cta" viewTransition aria-current={home ? undefined : 'page'}>免費諮詢</Link>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="foot">
      <p className="row" style={{ margin: 0 }}><b style={{ letterSpacing: '.24em', fontWeight: 400, fontSize: 20 }}>IRIS</b><span className="overline">聲樂工作室</span></p>
      <p className="caption">[地址] · LINE [@官方帳號] · [Email]</p>
      <p className="caption"><Link to="/consult">預約免費諮詢</Link> · 已經是學生了？ <Link to="/login">登入</Link></p>
    </footer>
  );
}

/** /consult: the free-consult form on its own page (moved off the home page). */
export function ConsultPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="site lp">
      <SiteHeader />
      <section id="consult" className="cs" aria-labelledby="con-t">
        <div className="cs-intro">
          <p className="lp-over">免費諮詢</p>
          <h1 className="lp-h1" id="con-t">先聊聊，再決定</h1>
          <ol className="cs-steps" aria-label="諮詢流程">
            <li><span aria-hidden="true">1</span>填寫需求</li>
            <li><span aria-hidden="true">2</span>免費聊 15 分鐘</li>
            <li><span aria-hidden="true">3</span>再決定要不要上課</li>
          </ol>
        </div>
        <ConsultForm />
      </section>
      <SiteFooter />
    </div>
  );
}

type ConsultTime = keyof typeof CONSULT_TIME_LABEL;
/** Feels like a short message to Iris: name, how to reach you, a rough time window, what's on your mind. */
function ConsultForm() {
  const send = useSendConsult();
  const [f, setF] = useState<{ name: string; contactType: 'line' | 'email'; contact: string; preferredTime: ConsultTime | null; topic: string }>(
    { name: '', contactType: 'line', contact: '', preferredTime: null, topic: '' });
  const [tried, setTried] = useState(false);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contact.trim());
  const errs = {
    name: !f.name.trim() ? '請填寫名字。' : '',
    contact: !f.contact.trim() ? (f.contactType === 'line' ? '請留下 LINE ID。' : '請留下 Email。') : f.contactType === 'email' && !emailOk ? '請填寫正確的 Email。' : '',
    preferredTime: !f.preferredTime ? '請選一個方便聯絡的時間。' : '',
  };
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (Object.values(errs).some(Boolean)) return;
    send.mutate({ name: f.name.trim(), contactType: f.contactType, contact: f.contact.trim(), preferredTime: f.preferredTime!, topic: f.topic.trim() });
  };
  if (send.isSuccess) return (
    <div className="cs-card cs-sent" role="status">
      <span className="cs-sent-ico" aria-hidden="true"><Icon name="check" size={24} /></span>
      <h2>訊息已送出，謝謝你！</h2>
      <p>Iris 會在 1–2 天內用{f.contactType === 'line' ? ' LINE ' : ' Email '}聯絡你，約一個{CONSULT_TIME_LABEL[f.preferredTime!]}的時間聊聊。</p>
    </div>
  );
  const err = (k: keyof typeof errs) => (tried && errs[k] ? <p className="field-error" id={`${k}-err`}>{errs[k]}</p> : null);
  const bad = (k: keyof typeof errs) => tried && !!errs[k];
  return (
    <form className="cs-card" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="cn">名字</label>
        <input id="cn" className="input" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="怎麼稱呼你？" aria-invalid={bad('name')} aria-describedby="name-err" />{err('name')}</div>

      <fieldset className="field cs-fs"><legend>聯絡方式</legend>
        <div className="cs-seg" role="radiogroup" aria-label="聯絡方式">
          {(['line', 'email'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={f.contactType === t} onClick={() => setF({ ...f, contactType: t, contact: '' })}>{t === 'line' ? 'LINE' : 'Email'}</button>))}
        </div>
        <label className="sr-only" htmlFor="cc">{f.contactType === 'line' ? 'LINE ID' : 'Email'}</label>
        <input id="cc" className="input" key={f.contactType}
          type={f.contactType === 'email' ? 'email' : 'text'} inputMode={f.contactType === 'email' ? 'email' : 'text'}
          autoComplete={f.contactType === 'email' ? 'email' : 'off'} autoCapitalize="off" spellCheck={false}
          placeholder={f.contactType === 'line' ? '你的 LINE ID' : 'name@example.com'}
          value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} aria-invalid={bad('contact')} aria-describedby="contact-err" />{err('contact')}
      </fieldset>

      <fieldset className="field cs-fs"><legend>方便聯絡的時間</legend>
        <div className="cs-chips" role="radiogroup" aria-label="方便聯絡的時間" aria-describedby="preferredTime-err">
          {(Object.keys(CONSULT_TIME_LABEL) as ConsultTime[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={f.preferredTime === k} onClick={() => setF({ ...f, preferredTime: k })}>{CONSULT_TIME_LABEL[k]}</button>))}
        </div>{err('preferredTime')}
      </fieldset>

      <div className="field"><label htmlFor="cw">想聊什麼？<span className="cs-opt">（選填）</span></label>
        <textarea id="cw" className="input" rows={3} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="例如：想把高音唱穩、準備婚禮獻唱" /></div>

      {send.isError && <div className="notice error" role="alert"><Icon name="info" /><span>{(send.error as Error).message}</span></div>}
      <div className="cs-submit">
        <button className="btn primary lp-btn cs-btn" disabled={send.isPending}>{send.isPending ? '送出中…' : '和 Iris 聊聊'}</button>
        <p className="cs-reassure">免費 15 分鐘・沒有壓力，不需要先決定是否上課</p>
        <p className="cs-privacy">聯絡資料只會用於這次諮詢。</p>
      </div>
    </form>
  );
}
