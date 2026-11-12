import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { usePublicReels, useSendConsult } from '../lib/queries';
import { CONSULT_TIME_LABEL } from '../lib/date';
import { FOOTER_LINKS } from '../lib/legal';
import { reelShortcode } from '../lib/reels';
import {
  ABOUT_PHOTOS, EVENTS, HERO, INSTAGRAM_URL, LESSONS, SOCIAL, VOICES, type LessonIcon, type SitePhoto, type SocialIcon, type StudioEvent,
} from '../lib/landing-content';
import type { ConsultContactType, ConsultTime, PublicReel } from '../lib/types';
import { Icon } from '../components/Icon';
import { IrisLogo } from '../components/IrisLogo';
import { Photo } from '../components/ui';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Landing() {
  return (
    <div className="site lp">
      <SiteHeader home />
      <HeroIntro>
        <section id="hero" className="lp-hero2" aria-labelledby="hero-t">
          <Photo caption={HERO.caption} src={HERO.src} lqip={HERO.lqip} eager />
          <div className="lp-hero2-scrim" aria-hidden="true" />
          <div className="lp-hero2-copy">
            <h1 className="lp-hero2-title" id="hero-t">找到屬於<br />你的聲音</h1>
            <p className="lp-hero2-cap">不是唱得更像別人，而是更自在地唱成自己。</p>
          </div>
        </section>
      </HeroIntro>

      <section id="about" className="lp-sec lp-about2" aria-labelledby="about-t">
        <h2 className="lp-about-h" id="about-t">
          <span className="lp-about-zh">關於</span><IrisLogo className="lp-about-logo" /><span className="sr-only">Iris</span>
        </h2>
        <AboutCarousel photos={ABOUT_PHOTOS} />
        <div className="lp-about-text">
          <h3 className="lp-h2">你好，我是 Iris</h3>
          <p className="lp-p">我從小在教會詩班長大，大學主修聲樂。站上不同的舞台後才發現，比起自己唱，我更喜歡陪別人找到自己的聲音。這幾年的學生從八歲到六十幾歲都有，每個人來上課的原因都不一樣。</p>
          <p className="lp-p">所以第一堂課，我會先聽你唱一首喜歡的歌，了解你的音色、呼吸和最舒服的音域，再一起決定要往哪裡練。很多人覺得自己「五音不全」，其實只是還沒找到用對身體的方法。</p>
        </div>
      </section>

      <section id="benefits" className="lp-sec lp-lessons" aria-labelledby="ben-t">
        <h2 className="lp-big-h" id="ben-t">課程內容</h2>
        <p className="lp-lead">Iris 可以幫你什麼</p>
        <ul className="lp-lessons-list">
          {LESSONS.map((l) => (
            <li key={l.title}><LessonIllustration kind={l.icon} /><h3>{l.title}</h3><p>{l.text}</p><small>{l.note}</small></li>
          ))}
        </ul>
      </section>

      <section id="voices" className="lp-sec lp-voices" aria-labelledby="voi-t">
        <h2 className="lp-big-h lp-big-h-sage" id="voi-t">學生心得</h2>
        <p className="lp-lead">學生怎麼說</p>
        <ul className="lp-vcards">
          {VOICES.map((v) => (
            <li key={v.name}>
              <figure className="lp-vcard">
                <Photo caption={`${v.name}的照片`} src={v.photo} />
                <figcaption>
                  <p className="lp-vname">{v.name}</p>
                  <blockquote className="lp-vquote">{v.quote}</blockquote>
                  <p className="lp-vmeta">{v.job} · {v.time}</p>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>

      <ReelsSection />

      <section id="events" className="lp-sec" aria-labelledby="evt-t">
        <p className="lp-over">Iris Studio Event</p>
        <h2 className="lp-h2" id="evt-t">工作室活動</h2>
        <div className="lp-events">{EVENTS.map((e) => <EventCard key={e.title} ev={e} />)}</div>
      </section>

      <section id="cta" className="lp-final" aria-labelledby="cta-t">
        <h2 className="lp-h2" id="cta-t">還不確定從哪裡開始？</h2>
        <p className="lp-sub">先聊聊你現在的聲音，和你想唱到哪裡。</p>
        <Link to="/consult" className="btn primary lp-btn" viewTransition>免費聊 15 分鐘</Link>
        <p className="lp-cap">沒有壓力，也不用先決定要不要上課。</p>
      </section>
      <SiteFooter />
    </div>
  );
}

function EventCard({ ev }: { ev: StudioEvent }) {
  const [open, setOpen] = useState(false);
  const id = `ev-more-${ev.title}`;
  const more = ev.photos.slice(3);
  return (
    <article className="lp-event" aria-labelledby={`${id}-t`}>
      <div className="lp-ev-photos">
        <div className="lp-ev-main"><Photo {...ev.photos[0]} /></div>
        <div className="lp-ev-thumb"><Photo {...ev.photos[1]} /></div>
        <div className="lp-ev-thumb"><Photo {...ev.photos[2]} /></div>
      </div>
      {open && <div className="lp-ev-more" id={id}>{more.map((p) => <div className="lp-ev-thumb" key={p.caption}><Photo {...p} /></div>)}</div>}
      <div className="lp-ev-text">
        <p className="lp-ev-meta">{ev.date} · {ev.place}</p>
        <h3 id={`${id}-t`}>{ev.title}</h3>
        <p>{ev.summary}</p>
        {more.length > 0 && (
          <button className="lp-textlink" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            {open ? '收起照片' : `查看更多照片（${more.length}）`}
          </button>
        )}
      </div>
    </article>
  );
}

/** Site header. On the home page it floats over the hero photo and turns solid once the hero has scrolled away. */
export function SiteHeader({ home }: { home?: boolean }) {
  const [solid, setSolid] = useState(!home);
  useEffect(() => {
    if (!home) return;
    const hero = document.getElementById('hero');
    const check = () => setSolid(!hero || hero.getBoundingClientRect().bottom <= 72);
    check();
    addEventListener('scroll', check, { passive: true });
    addEventListener('resize', check);
    return () => { removeEventListener('scroll', check); removeEventListener('resize', check); };
  }, [home]);
  return (
    <header className={`topbar lp-bar${home ? ' lp-bar-home' : ''}${solid ? ' is-solid' : ' is-over'}`}>
      {home
        ? <a href="#hero" className="brand" aria-label="Iris 聲樂工作室 首頁"><IrisLogo /><span>聲樂教練</span></a>
        : <Link to="/" className="brand" aria-label="回到 Iris 聲樂工作室 首頁" viewTransition><IrisLogo /><span>聲樂教練</span></Link>}
      <nav aria-label="頁面導覽">
        {home ? (
          <>
            <a href="#about">關於 Iris</a>
            <a href="#benefits">課程內容</a>
            <a href="#voices">學生心得</a>
            <a href="#events">活動</a>
          </>
        ) : <Link to="/" viewTransition>回首頁</Link>}
      </nav>
      <Link to="/login" className="lp-bar-login" viewTransition>登入</Link>
      <Link to="/consult" className="lp-bar-cta" viewTransition aria-current={home ? undefined : 'page'}>免費諮詢<Icon name="chev" size={16} /></Link>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="foot ft">
      <div className="ft-card">
        <div className="ft-top">
          <div>
            <p className="ft-brand"><IrisLogo /><span className="sr-only">Iris Vocal Studio</span><span>聲樂工作室</span></p>
            <p className="ft-tag">陪你找到自己的聲音。</p>
          </div>
          <ul className="ft-social" aria-label="Iris 的社群帳號">
            {SOCIAL.map((s) => (
              <li key={s.name}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`${s.name}（另開新視窗）`} title={s.name}><SocialGlyph kind={s.icon} /></a>
              </li>
            ))}
          </ul>
        </div>
        <nav className="ft-cols" aria-label="服務與隱私資訊">
          <div>
            <h2 className="ft-h">服務資訊</h2>
            <ul>{FOOTER_LINKS.service.map((l) => <li key={l.to}><Link to={l.to} viewTransition>{l.label}</Link></li>)}</ul>
          </div>
          <div>
            <h2 className="ft-h">隱私與權益</h2>
            <ul>{FOOTER_LINKS.privacy.map((l) => <li key={l.to}><Link to={l.to} viewTransition>{l.label}</Link></li>)}</ul>
          </div>
        </nav>
        <p className="ft-small">© 2026 IRIS Studio. All rights reserved.</p>
        <p className="ft-small">個人資料保護聯絡窗口：<span className="ft-todo">【待填：正式聯絡信箱】</span></p>
      </div>
    </footer>
  );
}

/** /consult — 先聊聊，再決定 */
export function ConsultPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="site lp">
      <SiteHeader />
      <section id="consult" className="cs" aria-labelledby="con-t">
        <div className="cs-intro">
          <Link to="/" className="au-home cs-home" viewTransition><Icon name="back" size={16} />首頁</Link>
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

type ConsultField = 'name' | 'contact' | 'preferredTime';

function ConsultForm() {
  const send = useSendConsult();
  const [f, setF] = useState<{ name: string; contactType: ConsultContactType; contact: string; preferredTime: ConsultTime | null; topic: string }>(
    { name: '', contactType: 'line', contact: '', preferredTime: null, topic: '' });
  const [tried, setTried] = useState(false);
  const [contactSettled, setContactSettled] = useState(false);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contact.trim());
  const lineOk = /^[a-z0-9._-]{4,20}$/.test(f.contact.trim());

  useEffect(() => {
    setContactSettled(false);
    if (!f.contact.trim()) return;
    const t = window.setTimeout(() => setContactSettled(true), 600);
    return () => window.clearTimeout(t);
  }, [f.contact, f.contactType]);

  const problems: Record<ConsultField, string> = {
    name: f.name.trim() ? '' : '請填寫名字。',
    contact: !f.contact.trim() ? (f.contactType === 'line' ? '請留下 LINE ID。' : '請留下 Email。')
      : f.contactType === 'email' && !emailOk ? '請填寫正確的 Email。'
      : f.contactType === 'line' && !lineOk ? 'LINE ID 是 4–20 個小寫英文、數字或 . - _' : '',
    preferredTime: f.preferredTime ? '' : '請選一個方便聯絡的時間。',
  };
  const filled = !!f.name.trim() && !!f.contact.trim() && !!f.preferredTime;
  const ready = filled && !Object.values(problems).some(Boolean);
  const bad = (k: ConsultField) => !!problems[k] && (tried || (k === 'contact' && contactSettled));
  const err = (k: ConsultField) => (bad(k) ? <p className="field-error" id={`${k}-err`}>{problems[k]}</p> : null);

  const submit = (e: FormEvent) => {
    e.preventDefault(); setTried(true);
    if (!ready || !f.preferredTime) return;
    send.mutate({ name: f.name.trim(), contactType: f.contactType, contact: f.contact.trim(), preferredTime: f.preferredTime, topic: f.topic.trim() });
  };

  if (send.isSuccess && f.preferredTime) {
    return (
      <div className="cs-card cs-sent" role="status">
        <span className="cs-sent-ico" aria-hidden="true"><Icon name="check" size={24} /></span>
        <h2>訊息已送出，謝謝你！</h2>
        <p>Iris 會在 1–2 天內用{f.contactType === 'line' ? ' LINE ' : ' Email '}聯絡你，約一個{CONSULT_TIME_LABEL[f.preferredTime]}的時間聊聊。</p>
      </div>
    );
  }
  const req = <><span className="au-req" aria-hidden="true">*</span><span className="sr-only">（必填）</span></>;
  return (
    <form className="cs-card" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="cn">名字{req}</label>
        <input id="cn" className="input" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
          placeholder="怎麼稱呼你？" aria-invalid={bad('name')} aria-describedby="name-err" />
        {err('name')}
      </div>
      <fieldset className="field cs-fs">
        <legend>聯絡方式{req}</legend>
        <div className={`cs-combo${bad('contact') ? ' is-bad' : ''}`}>
          <div className="cs-combo-top">
            <div className="cs-seg" role="radiogroup" aria-label="聯絡方式">
              {(['line', 'email'] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={f.contactType === t} onClick={() => setF({ ...f, contactType: t, contact: '' })}>
                  {t === 'line' ? 'LINE' : 'Email'}
                </button>
              ))}
            </div>
            {f.contactType === 'line' && <LineIdHelp />}
          </div>
          <label className="sr-only" htmlFor="cc">{f.contactType === 'line' ? 'LINE ID' : 'Email'}</label>
          <input key={f.contactType} id="cc" className="input" type={f.contactType === 'email' ? 'email' : 'text'} inputMode={f.contactType === 'email' ? 'email' : 'text'}
            autoComplete={f.contactType === 'email' ? 'email' : 'off'} autoCapitalize="off" spellCheck={false}
            placeholder={f.contactType === 'line' ? '你的 LINE ID' : 'name@example.com'} value={f.contact}
            onChange={(e) => setF({ ...f, contact: e.target.value })} aria-invalid={bad('contact')} aria-describedby="contact-err" />
        </div>
        {err('contact')}
      </fieldset>
      <fieldset className="field cs-fs">
        <legend>方便聯絡的時間{req}</legend>
        <div className="cs-chips" role="radiogroup" aria-label="方便聯絡的時間" aria-describedby="preferredTime-err">
          {(Object.keys(CONSULT_TIME_LABEL) as ConsultTime[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={f.preferredTime === k} onClick={() => setF({ ...f, preferredTime: k })}>{CONSULT_TIME_LABEL[k]}</button>
          ))}
        </div>
        {err('preferredTime')}
      </fieldset>
      <div className="field">
        <label htmlFor="cw">想聊什麼？<span className="cs-opt">（選填）</span></label>
        <textarea id="cw" className="input" rows={3} value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="例如：想把高音唱穩、準備婚禮獻唱" />
      </div>
      {send.isError && <div className="notice error" role="alert"><Icon name="info" /><span>{send.error.message}</span></div>}
      <div className="cs-submit">
        <button className="btn primary lp-btn cs-btn" disabled={!ready || send.isPending} aria-describedby={ready ? undefined : 'cs-need'}>
          {send.isPending ? '送出中…' : ready ? '和 Iris 聊聊' : filled ? '請確認填寫的內容' : '先填寫資訊喔！'}
        </button>
        {!ready && <p className="sr-only" id="cs-need">{filled ? '有欄位格式不正確，請修正後再送出。' : '請先填寫名字、聯絡方式和方便聯絡的時間。'}</p>}
        <p className="cs-reassure">免費 15 分鐘・沒有壓力，不需要先決定是否上課</p>
        <p className="cs-privacy">聯絡資料只會用於這次諮詢。</p>
      </div>
    </form>
  );
}

/**
 * Hero stage: the photo stays pinned while the page scrolls over it; a scroll hint fades once the visitor scrolls.
 * --p (0–1) eases toward the scroll progress each frame. Off with reduced motion.
 */
function HeroIntro({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotion(!mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bar = document.querySelector<HTMLElement>('.site .lp-bar');
    const setHead = () => { if (bar) el.style.setProperty('--lp-head', `${bar.offsetTop + bar.offsetHeight}px`); };
    setHead();
    if (!motion) { addEventListener('resize', setHead); return () => removeEventListener('resize', setHead); }
    let shown = -1, target = 0, frame = 0, gone = false;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const measure = () => {
      const r = el.getBoundingClientRect();
      target = clamp(-r.top / Math.max(1, r.height - innerHeight));
      const scrolled = scrollY > 24;
      if (scrolled !== gone) { gone = scrolled; el.classList.toggle('is-gone', scrolled); }
    };
    const step = () => {
      frame = 0;
      shown = shown < 0 ? target : shown + (target - shown) * 0.18;
      if (Math.abs(target - shown) < 8e-4) shown = target;
      el.style.setProperty('--p', shown.toFixed(4));
      if (shown !== target) frame = requestAnimationFrame(step);
    };
    const onScroll = () => { measure(); if (!frame) frame = requestAnimationFrame(step); };
    const onResize = () => { setHead(); onScroll(); };
    measure(); step();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onResize);
    return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); cancelAnimationFrame(frame); el.classList.remove('is-gone'); };
  }, [motion]);
  return (
    <div ref={ref} className={`lp-intro${motion ? ' is-on' : ''}`}>
      <div className="lp-stage">
        {children}
        <span className="lp-scrollhint" aria-hidden="true"><span>向下滑動</span><Icon name="chevDown" size={18} /></span>
      </div>
    </div>
  );
}

const SLIDE_MS = 10_000;

/** 關於 Iris photo carousel: auto-advances every 10 s while visible; pauses on hover/focus, when hidden, or with reduced motion. */
function AboutCarousel({ photos }: { photos: SitePhoto[] }) {
  const n = photos.length;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [still, setStill] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const left = useRef(SLIDE_MS);

  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setStill(mq.matches);
    onMotion();
    mq.addEventListener('change', onMotion);
    const onVis = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    if (ref.current) io.observe(ref.current);
    return () => { mq.removeEventListener('change', onMotion); document.removeEventListener('visibilitychange', onVis); io.disconnect(); };
  }, []);

  const running = !hovered && visible && !pageHidden && !still && n > 1;
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    let fired = false;
    const t = setTimeout(() => { fired = true; left.current = SLIDE_MS; setIndex((i) => (i + 1) % n); }, left.current);
    return () => { clearTimeout(t); if (!fired) left.current = Math.max(0, left.current - (performance.now() - start)); };
  }, [running, index, n]);

  /** signed distance from the current slide, the short way round */
  const offset = (i: number) => { const d = (i - index + n) % n; return d > n / 2 ? d - n : d; };
  return (
    <div className={`ac${still ? ' is-still' : ''}`} ref={ref} role="region" aria-roledescription="carousel" aria-label="Iris 與工作室的照片"
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}>
      <div className="ac-track">
        {photos.map((p, i) => {
          const d = offset(i);
          return (
            <div key={i} className="ac-slide" data-pos={Math.abs(d) <= 1 ? d : d < 0 ? 'out-l' : 'out-r'} role="group" aria-roledescription="slide"
              aria-label={`${i + 1} / ${n}`} aria-hidden={d !== 0}>
              <Photo caption={p.caption} src={p.src} lqip={p.lqip} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Line drawings for the 課程內容 cards. */
function LessonIllustration({ kind }: { kind: LessonIcon }) {
  const svg = { viewBox: '0 0 64 64', fill: '#FFFFFF', stroke: '#1F2A24', strokeWidth: 1.8, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const, className: 'lp-licon', 'aria-hidden': true };
  if (kind === 'mic') return (
    <svg {...svg}>
      <g transform="rotate(32 30 30)">
        <path d="M23 26 H37 L34.2 50 Q30 53.5 25.8 50 Z" /><rect x="28.4" y="31" width="3.2" height="6" rx="1" /><path d="M28 52 V58" fill="none" />
        <circle cx="30" cy="16" r="11" /><path d="M19.6 19.4 Q30 23.6 40.4 19.4" fill="none" /><path d="M20.4 21.6 Q30 26 39.6 21.6" fill="none" />
      </g>
      <path d="M45 30 V49" /><path d="M45 30 Q46 36 52 38 Q56 39.5 55 45 Q53 40.5 45 39.5 Z" />
      <ellipse cx="41.2" cy="50.2" rx="4.6" ry="3.6" transform="rotate(-20 41.2 50.2)" />
    </svg>
  );
  if (kind === 'notes') return (
    <svg {...svg}>
      <path d="M30.6 12 H34.4 V46 H30.6 Z" /><path d="M34.4 12 Q36 22 42 25 Q47 28 45.5 35 Q43 29 34.4 27.5 Z" />
      <ellipse cx="27" cy="47" rx="8" ry="6" transform="rotate(-22 27 47)" />
      <path d="M13 22 H15.6 V40 H13 Z" /><path d="M15.6 22 Q16.6 27 20 28.6 Q22.4 30 21.6 34 Q20 30.6 15.6 29.6 Z" />
      <ellipse cx="10.6" cy="40.6" rx="4.4" ry="3.3" transform="rotate(-22 10.6 40.6)" />
      <path d="M51 38 H53.4 V53 H51 Z" /><path d="M53.4 38 Q54.2 42 57 43.4 Q59 44.6 58.4 48 Q57 45 53.4 44.2 Z" />
      <ellipse cx="48.8" cy="53.4" rx="4" ry="3" transform="rotate(-22 48.8 53.4)" />
      <path d="M42.6 12.1 L43.6 6.2 M47.4 14.6 L51.6 10.4 M49.9 19.4 L55.8 18.4" fill="none" strokeWidth={2.6} />
    </svg>
  );
  return (
    <svg {...svg}>
      <path d="M9 40 V33 C9 19.5 19.5 9 32 9 C44.5 9 55 19.5 55 33 V40 H50.4 V33 C50.4 22 42 13.6 32 13.6 C22 13.6 13.6 22 13.6 33 V40 Z" />
      <rect x="6" y="36" width="9" height="18" rx="3.5" /><rect x="13.4" y="33" width="9" height="23" rx="3.8" />
      <rect x="49" y="36" width="9" height="18" rx="3.5" /><rect x="41.6" y="33" width="9" height="23" rx="3.8" />
    </svg>
  );
}

function SocialGlyph({ kind }: { kind: SocialIcon }) {
  if (kind === 'instagram') return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
  if (kind === 'facebook') return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M13.6 21v-8h2.7l.4-3.2h-3.1V7.8c0-.9.3-1.6 1.6-1.6h1.7V3.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.3H7.4V13h2.8v8h3.4z" />
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" fill="currentColor" /><path d="M10 9.2v5.6l4.8-2.8z" fill="#203129" />
    </svg>
  );
}

/**
 * 精彩片段: Iris's Reels (managed in 更多 → 網站精彩片段). Only covers are shown; Instagram (and its cookies)
 * loads only after a visitor taps play. Hidden while there are no Reels.
 */
function ReelsSection() {
  const reels = usePublicReels();
  const list = reels.data ?? [];
  if (list.length === 0) return null;
  return (
    <section id="reels" className="lp-sec lp-reels" aria-labelledby="reel-t">
      <h2 className="lp-big-h lp-big-h-sage" id="reel-t">精彩片段</h2>
      <p className="lp-lead">
        課堂、成果發表和學生的小小進步。
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="lp-reels-ig">在 Instagram 看更多<span className="sr-only">（另開新視窗）</span> ↗</a>
      </p>
      <ReelRail reels={list} />
    </section>
  );
}

function ReelRail({ reels }: { reels: PublicReel[] }) {
  const rail = useRef<HTMLUListElement>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const scroll = (dir: -1 | 1) => rail.current?.scrollBy({ left: dir * rail.current.clientWidth * 0.8, behavior: reducedMotion() ? 'auto' : 'smooth' });
  const current = playing === null ? null : reels[playing];
  const code = current ? reelShortcode(current.url) : null;
  return (
    <div className="rl">
      <div className="rl-nav">
        <button type="button" className="rl-arrow" aria-label="往左看更多片段" onClick={() => scroll(-1)}><Icon name="back" size={18} /></button>
        <button type="button" className="rl-arrow" aria-label="往右看更多片段" onClick={() => scroll(1)}><Icon name="chev" size={18} /></button>
      </div>
      <ul className="rl-rail" ref={rail} aria-label="Instagram Reels，可左右滑動">
        {reels.map((r, i) => (
          <li key={r.id}>
            <button type="button" className="rl-tile" onClick={() => setPlaying(i)} aria-label={`播放第 ${i + 1} 支 Reel（Instagram）`}>
              <Photo caption="" src={r.thumbnailUrl} lqip={r.lqip} />
              <span className="rl-play" aria-hidden="true"><Icon name="play" size={22} weight="fill" /></span>
              <span className="rl-tag" aria-hidden="true"><SocialGlyph kind="instagram" /> Reel</span>
            </button>
          </li>
        ))}
      </ul>
      {playing !== null && code && <ReelDialog code={code} n={playing + 1} onClose={() => setPlaying(null)} />}
    </div>
  );
}

function ReelDialog({ code, n, onClose }: { code: string; n: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    d.showModal();
    document.documentElement.classList.add('modal-open');
    return () => document.documentElement.classList.remove('modal-open');
  }, []);
  const url = `https://www.instagram.com/p/${code}/`;
  return (
    <dialog ref={ref} className="rl-dlg" aria-label={`第 ${n} 支 Reel`} onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}>
      <div className="rl-box">
        <button type="button" className="rl-x" aria-label="關閉" onClick={() => ref.current?.close()}><Icon name="x" size={20} /></button>
        <iframe className="rl-frame" src={`${url}embed/`} title={`Instagram Reel ${n}`} allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
          allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        <p className="rl-note">影片由 Instagram 提供。看不到影片？<a href={url} target="_blank" rel="noopener noreferrer">在 Instagram 開啟<span className="sr-only">（另開新視窗）</span> ↗</a></p>
      </div>
    </dialog>
  );
}

/** ⓘ 怎麼找 LINE ID？ — opens on click, or after hovering 3 s. */
function LineIdHelp() {
  const ref = useRef<HTMLDialogElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const open = () => { window.clearTimeout(timer.current); if (!ref.current?.open) ref.current?.showModal(); };
  const cancel = () => window.clearTimeout(timer.current);
  useEffect(() => cancel, []);
  return (
    <>
      <button type="button" className="cs-info" aria-label="怎麼找到 LINE ID？" aria-haspopup="dialog" onClick={open}
        onMouseEnter={() => { cancel(); timer.current = window.setTimeout(open, 3000); }} onMouseLeave={cancel}>
        <Icon name="info" size={16} /><span>怎麼找 LINE ID？</span>
      </button>
      <dialog ref={ref} className="cs-help" aria-labelledby="lid-t" onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}>
        <h2 id="lid-t">怎麼找到 LINE ID？</h2>
        <p>LINE ID 在 LINE App 裡：</p>
        <ol>
          <li>打開 LINE，進入首頁（Home）</li>
          <li>點右上角的齒輪 ⚙︎</li>
          <li>選有大頭貼的「個人檔案」（Profile）</li>
          <li>找到「ID」欄位，就是你的 LINE ID</li>
        </ol>
        <button type="button" className="btn primary lp-btn" onClick={() => ref.current?.close()}>知道了</button>
      </dialog>
    </>
  );
}
