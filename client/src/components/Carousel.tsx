import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Photo } from './ui';

/**
 * Photo carousel built on native horizontal scroll + scroll-snap.
 * Why native scroll instead of a JS slider: swipe on phones, trackpad and keyboard scrolling all work for free,
 * and the browser handles momentum. JS only syncs the dots and the prev/next buttons.
 */
export function PhotoCarousel({ slides, label }: { slides: { caption: string; src?: string; lqip?: string }[]; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setI(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const go = (n: number) => {
    const el = track.current;
    if (!el) return;
    const to = Math.max(0, Math.min(slides.length - 1, n));
    el.scrollTo({ left: to * el.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <div className="carousel" role="region" aria-roledescription="carousel" aria-label={label}>
      <div className="carousel-track" ref={track} tabIndex={0} aria-live="polite">
        {slides.map((s, n) => (
          <div className="carousel-slide" key={n} role="group" aria-roledescription="slide" aria-label={`${n + 1} / ${slides.length}`}>
            <Photo caption={s.caption} src={s.src} lqip={s.lqip} style={{ width: '100%', height: '100%' }} />
          </div>
        ))}
      </div>
      <button className="icon-btn carousel-prev" aria-label="上一張" disabled={i === 0} onClick={() => go(i - 1)}><Icon name="back" /></button>
      <button className="icon-btn carousel-next" aria-label="下一張" disabled={i === slides.length - 1} onClick={() => go(i + 1)}><Icon name="chev" /></button>
      <div className="carousel-dots">
        {slides.map((_, n) => (
          <button key={n} aria-label={`第 ${n + 1} 張`} aria-current={i === n} onClick={() => go(n)}><span /></button>
        ))}
      </div>
    </div>
  );
}

/** One-at-a-time card carousel (testimonials). Same native scroll-snap approach; dots + buttons sit below the cards. */
export function CardCarousel({ children, label }: { children: React.ReactNode[]; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setI(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  const go = (n: number) => {
    const el = track.current;
    if (!el) return;
    const to = Math.max(0, Math.min(children.length - 1, n));
    el.scrollTo({ left: to * el.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return (
    <div className="card-carousel" role="region" aria-roledescription="carousel" aria-label={label}>
      <div className="card-carousel-track" ref={track} tabIndex={0}>
        {children.map((c, n) => (
          <div className="card-carousel-slide" key={n} role="group" aria-roledescription="slide" aria-label={`${n + 1} / ${children.length}`}>{c}</div>
        ))}
      </div>
      <div className="row between">
        <div className="carousel-dots static">
          {children.map((_, n) => <button key={n} aria-label={`第 ${n + 1} 則`} aria-current={i === n} onClick={() => go(n)}><span /></button>)}
        </div>
        <div className="row g2">
          <button className="icon-btn" aria-label="上一則" disabled={i === 0} onClick={() => go(i - 1)}><Icon name="back" /></button>
          <button className="icon-btn" aria-label="下一則" disabled={i === children.length - 1} onClick={() => go(i + 1)}><Icon name="chev" /></button>
        </div>
      </div>
    </div>
  );
}

export interface Feature { icon: string; title: string; points: string[]; note: string; photo: { caption: string; src?: string; lqip?: string } }

/**
 * Auto-advancing feature carousel: each slide shows 5 s, then slides to the next and loops.
 * Accessibility (WCAG 2.2.2, moving content): a visible pause button, it pauses while hovered/focused or after
 * the visitor swipes, and it never auto-plays when the device asks for reduced motion.
 */
export function FeatureCarousel({ items, label, interval = 5000 }: { items: Feature[]; label: string; interval?: number }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(() => typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hover, setHover] = useState(false);
  const running = playing && !hover;

  const go = (n: number) => {
    const el = track.current;
    if (!el) return;
    const to = ((n % items.length) + items.length) % items.length;
    el.scrollTo({ left: to * el.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setI(Math.round(el.scrollLeft / el.clientWidth));
    const stopOnSwipe = () => setPlaying(false); // the visitor took control: don't fight them
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('touchstart', stopOnSwipe, { passive: true });
    el.addEventListener('wheel', stopOnSwipe, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); el.removeEventListener('touchstart', stopOnSwipe); el.removeEventListener('wheel', stopOnSwipe); };
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => go(i + 1), interval);
    return () => window.clearTimeout(t);
  }, [i, running, interval]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="feature-carousel" role="region" aria-roledescription="carousel" aria-label={label}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <div className="feature-track" ref={track} tabIndex={0} aria-label={`${label}，可用方向鍵左右捲動`} aria-live={running ? 'off' : 'polite'}>
        {items.map((f, n) => (
          <article className="feature-slide" key={f.title} role="group" aria-roledescription="slide" aria-label={`${n + 1} / ${items.length}：${f.title}`}>
            <div className="feature-photo"><Photo caption={f.photo.caption} src={f.photo.src} lqip={f.photo.lqip} style={{ width: '100%', height: '100%' }} /></div>
            <div className="feature-body">
              <span className="ico"><Icon name={f.icon} /></span>
              <h3 className="h2">{f.title}</h3>
              <ul className="dots">{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
              <p className="caption">{f.note}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="row between">
        <div className="row g2">
          <div className="carousel-dots static">
            {items.map((f, n) => <button key={f.title} aria-label={`第 ${n + 1} 項：${f.title}`} aria-current={i === n} onClick={() => go(n)}><span /></button>)}
          </div>
          <div className="feature-progress" aria-hidden="true"><span key={`${i}-${running}`} className={running ? 'run' : ''} style={{ animationDuration: `${interval}ms` }} /></div>
        </div>
        <div className="row g2">
          <button className="icon-btn" aria-label={playing ? '暫停自動輪播' : '開始自動輪播'} onClick={() => setPlaying(!playing)}>
            {playing ? <Icon name="pause" size={18} /> : <Icon name="play" size={18} />}
          </button>
          <button className="icon-btn" aria-label="上一項" onClick={() => go(i - 1)}><Icon name="back" /></button>
          <button className="icon-btn" aria-label="下一項" onClick={() => go(i + 1)}><Icon name="chev" /></button>
        </div>
      </div>
    </div>
  );
}
