import { useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { dayNum, monthNum, studioToday } from '../lib/date';
import { Icon } from './Icon';

/* ---------- skeletons: shaped like the content, no spinners ---------- */
export function Sk({ w = '100%', h = 16, card }: { w?: string | number; h?: number; card?: boolean }) {
  return <span className={`sk${card ? ' card-sk' : ''}`} style={{ display: 'block', width: w, height: h }} />;
}

export function PageSkeleton({ blocks = [140, 200] }: { blocks?: number[] }) {
  return (
    <div className="skel" role="status" aria-busy="true" aria-label="載入中">
      <Sk w="35%" h={16} />
      <Sk w="60%" h={32} />
      {blocks.map((h, i) => <Sk key={i} h={h} card />)}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card tight" role="status" aria-busy="true" aria-label="載入中">
      {Array.from({ length: rows }, (_, i) => (
        <div className="li" key={i}>
          <Sk w={44} h={44} />
          <div className="grow stack g1"><Sk w="50%" h={16} /><Sk w="70%" h={12} /></div>
        </div>
      ))}
    </div>
  );
}

/* ---------- status: colour + shape + word, never colour alone (the dot comes from .tag:before) ---------- */
export type Tone = 'ok' | 'accent' | 'grey' | 'warn' | 'bad';
export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

/** Calendar-leaf date: month strip on top, big day number below. Today gets a sage ring, past days go quiet. */
export function DateBox({ date }: { date: string }) {
  const today = studioToday();
  return (
    <div className={`dbox${date === today ? ' today' : date < today ? ' past' : ''}`} aria-hidden="true">
      <span>{monthNum(date)}月</span>
      <b>{dayNum(date)}</b>
    </div>
  );
}

/**
 * Lesson squares: ✓ filled = attended · ✕ = late cancel (counted) · tinted = cancelled by 回報 ·
 * ● = booked · ○ = free. `plain` drops the glyphs (small summary rows).
 */
export function Quota({ attended, booked, free, cancelled = 0, reported = 0, plain }: {
  attended: number; booked: number; free: number; cancelled?: number; reported?: number; plain?: boolean;
}) {
  const label = `已上 ${attended} 堂、${cancelled ? `逾時取消 ${cancelled} 堂、` : ''}${reported ? `已取消 ${reported} 堂、` : ''}已預約 ${booked} 堂、可預約 ${free} 堂`;
  return (
    <div className={`quota${plain ? ' plain' : ''}`} role="img" aria-label={label}>
      {Array.from({ length: attended }, (_, i) => <span key={`a${i}`} className="q a">{!plain && <Icon name="check" size={18} weight="bold" />}</span>)}
      {Array.from({ length: cancelled }, (_, i) => <span key={`x${i}`} className="q x"><Icon name="x" size={16} weight="bold" /></span>)}
      {Array.from({ length: reported }, (_, i) => <span key={`r${i}`} className="q r" aria-hidden="true" />)}
      {Array.from({ length: booked }, (_, i) => <span key={`b${i}`} className="q b" aria-hidden="true">{!plain && '●'}</span>)}
      {Array.from({ length: free }, (_, i) => <span key={`f${i}`} className="q f" aria-hidden="true">{!plain && '○'}</span>)}
    </div>
  );
}

export function PageHead({ title, over, under, back, right }: { title: string; over?: ReactNode; under?: ReactNode; back?: boolean; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="row between">
      {back && <button className="icon-btn" aria-label="返回" onClick={() => navigate(-1)}><Icon name="back" /></button>}
      <div className="grow stack g1">
        {over && <p className="overline">{over}</p>}
        <h1 className="h1">{title}</h1>
        {under && <p className="ph-under">{under}</p>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="stack g3" style={{ alignItems: 'flex-start' }}>
      <p className="caption">{text}</p>
      {action}
    </div>
  );
}

export function ErrorCard({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : null;
  return (
    <div className="notice error" role="alert">
      <Icon name="info" />
      <span className="grow">{message ?? '載入失敗。'}</span>
      {retry && <button className="btn sm secondary" onClick={retry}>重試</button>}
    </div>
  );
}

/* ---------- images: blurred placeholder while loading ---------- */
export function BlurImage({ src, lqip, alt, className, style, eager }: {
  src: string; lqip?: string | null; alt: string; className?: string; style?: CSSProperties; eager?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`blur-img ${className ?? ''}`} style={{ backgroundImage: lqip ? `url(${lqip})` : undefined, backgroundColor: 'var(--mist)', ...style }}>
      <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" {...(eager ? { fetchPriority: 'high' as const } : {})}
        className={loaded ? 'loaded' : ''} onLoad={() => setLoaded(true)} />
    </div>
  );
}

/** A photo, or a labelled placeholder until Iris provides a real, consented one. */
export function Photo({ caption, src, lqip, style, eager }: { caption: string; src?: string; lqip?: string | null; style?: CSSProperties; eager?: boolean }) {
  if (src) return <BlurImage src={src} lqip={lqip} alt={caption} className="photo" style={style} eager={eager} />;
  return (
    <div className="photo" style={style} aria-hidden="true">
      <Icon name="image" size={40} />
      <span className="cap-tag">[{caption}]</span>
    </div>
  );
}
