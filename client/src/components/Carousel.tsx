import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Benefits (WEB-4): phone = swipe row with snap, the next card peeks, page dots (tap = jump), no autoplay;
 * desktop = 3 columns (CSS). Keyboard: the row is focusable and scrolls with arrow keys.
 */
export function BenefitsRow({ items }: { items: { title: string; body: ReactNode }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(0);

  const onScroll = useCallback(() => {
    const el = ref.current; if (!el) return;
    const kids = [...el.children] as HTMLElement[];
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0, dist = Infinity;
    kids.forEach((k, i) => { const d = Math.abs(k.offsetLeft + k.offsetWidth / 2 - mid); if (d < dist) { dist = d; best = i; } });
    setOn(best);
  }, []);

  const jump = (i: number) => {
    const el = ref.current; const k = el?.children[i] as HTMLElement | undefined;
    if (el && k) el.scrollTo({ left: k.offsetLeft - (el.clientWidth - k.offsetWidth) / 2, behavior: prefersReduced() ? 'auto' : 'smooth' });
  };

  return (
    <>
      <div className="benefits" ref={ref} onScroll={onScroll} tabIndex={0} aria-label="學習好處，可左右滑動">
        {items.map((b, i) => (
          <article key={b.title} className={`card benefit${i === on ? ' on' : ''}`}>
            <h3 className="sec">{b.title}</h3><p className="sub" style={{ fontSize: 15.5, lineHeight: '24px' }}>{b.body}</p>
          </article>
        ))}
      </div>
      <div className="dots m" role="group" aria-label="頁數">
        {items.map((b, i) => (
          <button key={b.title} className={i === on ? 'on' : ''} aria-label={`第 ${i + 1} 張`} aria-current={i === on} onClick={() => jump(i)}><i /></button>
        ))}
      </div>
    </>
  );
}

export interface Story { initials: string; who: string; text: string }
const STORY_MS = 7000;

/**
 * Student stories (WEB-5): one at a time, characters rise in like lyrics, 7 s autoplay with a progress line.
 * Pauses on hover / focus / touch and with ⏸; swipe and arrow keys move. Reduced motion = static, no autoplay.
 */
export function Stories({ stories }: { stories: Story[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hold, setHold] = useState(false); // hover / focus / touch
  const reduced = prefersReduced();
  const touchX = useRef<number | null>(null);
  const n = stories.length;
  const go = useCallback((d: number) => setI((v) => (v + d + n) % n), [n]);
  const running = !paused && !hold && !reduced;

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => go(1), STORY_MS);
    return () => window.clearTimeout(t);
  }, [running, i, go]);

  const s = stories[i];
  return (
    <div className="stack">
      <div className="stage" role="group" aria-roledescription="輪播" aria-label="學員心聲" tabIndex={0}
        onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}
        onTouchStart={(e) => { setHold(true); touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { setHold(false); if (touchX.current !== null) { const dx = e.changedTouches[0].clientX - touchX.current; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); } touchX.current = null; }}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }}>
        <blockquote key={i} className="quote" aria-live={running ? 'off' : 'polite'} style={{ margin: 0 }}>
          <span className="sr">{s.text}</span>
          <span aria-hidden>
            「{[...s.text].map((c, k) => <span key={k} className="ch" style={{ ['--i' as string]: reduced ? 0 : k, animation: reduced ? 'none' : undefined }}>{c}</span>)}」
          </span>
        </blockquote>
        <div className="cap">— {s.who}（示意文字，待學員同意後替換）</div>
        <div className="progress" aria-hidden>{running && <i key={i} style={{ animationDuration: `${STORY_MS}ms` }} />}</div>
      </div>
      <div className="row between">
        <div className="row" style={{ gap: 4 }}>
          {stories.map((t, k) => (
            <button key={t.initials} className="chip choice" aria-pressed={k === i} aria-label={`${t.who} 的心聲`} onClick={() => setI(k)} style={{ minWidth: 44, padding: 0 }}>{t.initials}</button>
          ))}
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="iconbtn" aria-label="上一則" onClick={() => go(-1)}><Icon name="back" /></button>
          {!reduced && <button className="iconbtn" aria-label={paused ? '繼續播放' : '暫停播放'} onClick={() => setPaused(!paused)}><Icon name={paused ? 'play' : 'pause'} /></button>}
          <button className="iconbtn" aria-label="下一則" onClick={() => go(1)}><Icon name="chev" /></button>
        </div>
      </div>
    </div>
  );
}
