import { useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../lib/api';
import { dayNum, initialOf, monthNum, studioToday } from '../lib/date';
import { Icon } from './Icon';

/* ---------- skeletons: shaped like the content, no spinners (§9) ---------- */
export function Sk({ w = '100%', h = 16, card }: { w?: string | number; h?: number; card?: boolean }) {
  return <div className={card ? 'sk card-sk' : 'sk'} style={{ width: w, height: h }} aria-hidden />;
}
export function PageSkeleton({ blocks = [140, 200] }: { blocks?: number[] }) {
  return (
    <div className="stack" role="status" aria-label="載入中">
      <Sk w="55%" h={36} />
      {blocks.map((h, i) => <Sk key={i} h={h} card />)}
    </div>
  );
}
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="list" role="status" aria-label="載入中">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="li"><Sk w={46} h={46} /><div className="grow stack s2"><Sk w="40%" h={16} /><Sk w="65%" h={13} /></div></div>
      ))}
    </div>
  );
}

/* ---------- status: colour + shape + word, never colour alone (§2.4) ---------- */
const MARK = { ok: '●', accent: '●', pending: '●', grey: '○', warn: '◆', bad: '✕' } as const;
export function Tag({ tone, children }: { tone: keyof typeof MARK; children: ReactNode }) {
  return <span className={`tag ${tone}`}><span className="mk" aria-hidden>{MARK[tone]}</span>{children}</span>;
}

export function DateBox({ date }: { date: string }) {
  const past = date < studioToday();
  return (
    <div className={`datebox${past ? ' past' : ''}`} aria-hidden>
      <div className="mo">{monthNum(date)}月</div><div className="d">{dayNum(date)}</div>
    </div>
  );
}

const TONES = ['#DDE4DC', '#E5DFD2', '#D9E1DE', '#E4DDD8'];
/** Tone is deterministic from the user id, so a student keeps the same colour everywhere. */
export function Avatar({ name, id, size = 46 }: { name: string; id: string; size?: 36 | 46 | 56 }) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return <span className={`avatar s${size}`} style={{ background: TONES[h % TONES.length] }} aria-hidden>{initialOf(name)}</span>;
}

/** 40 px squares: ✓ filled = attended, ● tint = booked, ○ outline = free. */
export function Quota({ attended, booked, free }: { attended: number; booked: number; free: number }) {
  const cells = [
    ...Array(attended).fill('att'), ...Array(booked).fill('bk'), ...Array(free).fill('fr'),
  ] as ('att' | 'bk' | 'fr')[];
  return (
    <div className="stack s2">
      <div className="quota" role="img" aria-label={`已上課 ${attended} 堂，已預約 ${booked} 堂，剩餘 ${free} 堂`}>
        {cells.map((c, i) => (
          <span key={i} className={`q ${c}`}>{c === 'att' ? <Icon name="check" size={18} weight="bold" /> : c === 'bk' ? '●' : ''}</span>
        ))}
      </div>
      <div className="legend"><span>✓ 已上課</span><span>● 已預約</span><span>○ 可預約</span></div>
    </div>
  );
}

export function PageHead({ title, over, back, right }: { title: string; over?: ReactNode; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="head">
      <div className="stack s2">
        {back && <button className="iconbtn back" aria-label="返回" onClick={() => nav(-1)}><Icon name="back" /></button>}
        {over && <div className="over">{over}</div>}
        <h1 className="h1">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return <div className="empty"><p>{text}</p>{action}</div>;
}

export function ErrorCard({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof ApiError ? error.message : '資料載入失敗，請再試一次。';
  return <div className="card" role="alert"><p className="err">{msg}</p>{retry && <button className="btn secondary sm" onClick={retry}>重新載入</button>}</div>;
}

/* ---------- controls ---------- */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Field({ label, error, hint, action, id, children, required }: { required?: boolean; label: string; error?: string; hint?: ReactNode; action?: ReactNode; id: string; children: ReactNode }) {
  return (
    <div className="field">
      {action ? <div className="field-label-row"><label htmlFor={id}>{label}{required && <span className="required" aria-hidden> *</span>}</label>{action}</div> : <label htmlFor={id}>{label}{required && <span className="required" aria-hidden> *</span>}</label>}
      {children}
      {error ? <span className="err" id={`${id}-err`}>{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function PasswordInput({ id, value, onChange, invalid, describedBy, autoComplete = 'current-password', disabled, placeholder = '請輸入密碼', required }: {
  id: string; value: string; onChange: (v: string) => void; invalid?: boolean; describedBy?: string;
  autoComplete?: 'current-password' | 'new-password'; disabled?: boolean; placeholder?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete} placeholder={placeholder} required={required} maxLength={128} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} />
      <button type="button" className="iconbtn" aria-label={show ? '隱藏密碼' : '顯示密碼'} aria-controls={id} aria-pressed={show} disabled={disabled} onClick={() => setShow(!show)}><Icon name={show ? 'eyeOff' : 'eye'} /></button>
    </div>
  );
}

/* ---------- images: blurred placeholder while loading ---------- */
export function BlurImage({ src, lqip, alt, className, style }: { src: string; lqip?: string | null; alt: string; className?: string; style?: CSSProperties }) {
  const [ready, setReady] = useState(false);
  return (
    <div className={`blur ${className ?? ''}`} style={style}>
      {lqip && !ready && <img className="lq" src={lqip} alt="" aria-hidden />}
      <img src={src} alt={alt} loading="lazy" onLoad={() => setReady(true)} style={{ opacity: ready || !lqip ? 1 : 0, width: '100%' }} />
    </div>
  );
}

/** Labelled placeholder until Iris provides a real, consented photo (WEB-8). */
export function Photo({ caption, src, lqip, style }: { caption: string; src?: string; lqip?: string; style?: CSSProperties }) {
  if (src) return <BlurImage src={src} lqip={lqip} alt={caption} style={{ borderRadius: 16, ...style }} />;
  return <div className="photo" style={style} role="img" aria-label={`${caption}（示意）`}>{caption}（待提供照片）</div>;
}
