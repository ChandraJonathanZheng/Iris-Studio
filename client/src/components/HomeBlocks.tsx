import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Icon } from './Icon';
import { BlurImage } from './ui';
import { CLASS_TYPE_LABEL, fmtDuration, initialOf, LESSON_TYPE_LABEL } from '../lib/date';
import type { Lesson, Payment, StudentSummary } from '../lib/types';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
/** minutes since midnight in Taipei (the studio's clock, not the phone's) */
const taipeiNowMin = () => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date());
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return (v('hour') % 24) * 60 + v('minute') + v('second') / 60;
};

/* =================== 今天的課 — timeline =================== */
/**
 * One vertical line; every class is a big black-outlined dot on it; "now" is a small white dot with a slowly
 * glowing blue ring that slides down the line. It sits *between* two classes in proportion to the time, and while
 * a class is running it sits *inside* that class's dot (the two merge = "the lesson is on now").
 */
export function TodayTimeline({ lessons }: { lessons: Lesson[] }) {
  const list = [...lessons].sort((a, b) => a.time.localeCompare(b.time));
  const [now, setNow] = useState(taipeiNowMin);
  useEffect(() => { const t = window.setInterval(() => setNow(taipeiNowMin()), 20_000); return () => window.clearInterval(t); }, []);
  const olRef = useRef<HTMLDivElement>(null);
  const [nowY, setNowY] = useState<number | null>(null);

  const start = (l: Lesson) => toMin(l.time), end = (l: Lesson) => toMin(l.time) + l.minutes;
  // the row turns grey as soon as its start time has passed (the now-dot has moved on past it);
  // "live" (blue, merged) is only the moment the now-dot reaches the class dot: the first minute after it starts
  const MEET = 1;
  const state = (l: Lesson) => l.status === 'Attended' || now >= start(l) + MEET ? 'done' : now >= start(l) ? 'live' : 'todo';
  const running = (l: Lesson) => now >= start(l) && now < end(l);
  const nextId = list.find((l) => state(l) === 'todo')?.id;

  // where on the line is "now"? measure each class dot's centre, then interpolate by time
  useLayoutEffect(() => {
    const ol = olRef.current; if (!ol || !list.length) return;
    const place = () => {
      const top = ol.getBoundingClientRect().top;
      const ys = [...ol.querySelectorAll<HTMLElement>('.tl-dot')].map((d) => { const r = d.getBoundingClientRect(); return r.top + r.height / 2 - top; });
      const H = ol.clientHeight;
      // the dot travels from one class's start to the next class's start, in proportion to the clock
      let y: number;
      if (now <= start(list[0])) y = Math.max(8, ys[0] - 30 * Math.min(1, (start(list[0]) - now) / 60));
      else {
        const last = list.length - 1;
        y = Math.min(H - 8, ys[last] + 30 * Math.min(1, (now - start(list[last])) / 60));
        for (let i = 0; i < last; i++) {
          if (now < start(list[i + 1])) { const k = (now - start(list[i])) / Math.max(1, start(list[i + 1]) - start(list[i])); y = ys[i] + (ys[i + 1] - ys[i]) * k; break; }
        }
      }
      setNowY(y);
    };
    place();
    const ro = new ResizeObserver(place); ro.observe(ol);
    return () => ro.disconnect();
  }, [now, lessons]);

  return (
    <div className="tl" ref={olRef}>
      <span className="tl-line" aria-hidden="true" />
      {nowY !== null && <span className="tl-now" style={{ top: nowY }} aria-hidden="true" />}
      <ol className="tl-list" aria-label="今天的課時間軸">
      {list.map((l) => {
        const s = state(l), isNext = l.id === nextId;
        return (
          <li key={l.id} className={`tl-row is-${s}${isNext ? ' is-next' : ''}${running(l) ? ' is-running' : ''}`} aria-current={running(l) ? 'time' : undefined}>
            <span className="tl-dot" aria-hidden="true" />
            <time className="tl-time">{l.time}</time>
            <div className="tl-body">
              <p className="tl-name">{l.studentName}</p>
              <p className="tl-meta">{fmtDuration(l.minutes)} · {LESSON_TYPE_LABEL[l.type]}</p>
            </div>
            <span className="tl-state">{running(l) && l.status !== 'Attended' ? '上課中' : s === 'done' ? '已上過' : isNext ? '下一堂' : l.change ? '改時間中' : '已預約'}</span>
          </li>
        );
      })}
      </ol>
    </div>
  );
}

/* =================== 最近付款記錄 =================== */
const two = (n: number) => String(n).padStart(2, '0');
/** "2026 - 11 - 13 14:05:22" in Taipei time */
export function fmtStamp(iso: string) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('year')} - ${v('month')} - ${v('day')} ${two(Number(v('hour')) % 24)}:${v('minute')}:${v('second')}`;
}

export function RecentPayments({ payments, students }: { payments: Payment[]; students: StudentSummary[] }) {
  const latest = [...payments].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).slice(0, 3);
  const byId = new Map(students.map((s) => [s.id, s]));
  const [open, setOpen] = useState<{ p: Payment; from: HTMLElement } | null>(null);
  const kind = (p: Payment) => {
    const s = byId.get(p.studentId);
    return p.trial || s?.status === 'Pending' ? '新學生' : s ? CLASS_TYPE_LABEL[s.classType] : '一對一';
  };
  if (!latest.length) return <p className="caption">還沒有付款記錄。</p>;
  return (
    <>
      <ul className="rp-list">
        {latest.map((p) => (
          <li key={p.id} className="rp-row">
            <span className="rp-av" aria-hidden="true">{p.studentAvatarUrl ? <img src={p.studentAvatarUrl} alt="" /> : initialOf(p.studentName)}</span>
            <span className="rp-who"><b className="rp-name">{p.studentName}</b><span className="rp-kind">{kind(p)}</span></span>
            <span className="rp-right">
              <time className="rp-at" dateTime={p.uploadedAt}>{fmtStamp(p.uploadedAt)}</time>
              <button type="button" className="rp-view" onClick={(e) => setOpen({ p, from: e.currentTarget })}
                style={open?.p.id === p.id ? { opacity: 0 } : undefined}>查看收據</button>
            </span>
          </li>
        ))}
      </ul>
      <ViewAllPayments />
      {open && <ReceiptPop p={open.p} from={open.from} onClosed={() => setOpen(null)} />}
    </>
  );
}

/** Receipt photo grows out of the 查看收據 text into the centre; X shrinks it back into the text, which fades back in. */
function ReceiptPop({ p, from, onClosed }: { p: Payment; from: HTMLElement; onClosed: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null), box = useRef<HTMLDivElement>(null), shade = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const delta = () => {
    const a = from.getBoundingClientRect(), b = box.current!.getBoundingClientRect();
    return `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px,${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${Math.max(.04, a.width / b.width)},${Math.max(.02, a.height / b.height)})`;
  };
  useEffect(() => {
    dlg.current?.showModal();
    if (reduceMotion()) return;
    const t = delta();
    box.current!.animate([{ transform: t, opacity: .2, borderRadius: '40px' }, { transform: 'scale(1.03)', opacity: 1, offset: .75 }, { transform: 'none', opacity: 1, borderRadius: '22px' }],
      { duration: 520, easing: 'cubic-bezier(.3,.7,.2,1)' });
    shade.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
  }, []);
  const close = () => {
    if (closing.current) return; closing.current = true;
    const done = () => { dlg.current?.close(); onClosed(); };
    if (reduceMotion() || !box.current) return done();
    const t = delta();
    box.current.animate([{ transform: 'none', opacity: 1 }, { transform: t, opacity: 0 }], { duration: 380, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
    shade.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease-in', fill: 'forwards' }).finished.then(() => {
      done();
      from.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' }); // the text comes back
    });
  };
  return (
    <dialog ref={dlg} className="rc-dlg" aria-label={`${p.studentName} 的收據`}
      onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === e.currentTarget || e.target === shade.current) close(); }}>
      <div className="rc-shade" ref={shade} />
      <div className="rc-box" ref={box}>
        <button type="button" className="rc-x" aria-label="關閉" onClick={close}><Icon name="x" size={20} /></button>
        <BlurImage src={p.receiptUrl} lqip={p.lqip} alt={`${p.studentName} 上傳的轉帳截圖`} className="rc-img" />
        <p className="rc-cap"><b>{p.studentName}</b> · {fmtStamp(p.uploadedAt)}</p>
      </div>
    </dialog>
  );
}

/** "查看所有付款記錄 >" — while the page changes, a receipt icon bounces in the middle, settles, then fades away. */
const RECEIPT_SVG = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><path d="M14 6h36v52l-6-4-6 4-6-4-6 4-6-4-6 4z" fill="#FFFFFF" stroke="#1E2A24" stroke-width="3.5" stroke-linejoin="round"/><path d="M22 20h20M22 29h20M22 38h12" stroke="#1E2A24" stroke-width="3.5" stroke-linecap="round"/></svg>`;
function ViewAllPayments() {
  const nav = useNavigate();
  const go = (e: React.MouseEvent) => {
    e.preventDefault();
    if (reduceMotion()) return nav('/teacher/payments');
    // plain DOM (not React state): this layer must outlive the home page, which unmounts when the route changes
    const el = document.createElement('div');
    el.className = 'rp-go'; el.innerHTML = `<span class="rp-go-ic">${RECEIPT_SVG}</span>`;
    document.body.appendChild(el);
    const ic = el.firstElementChild as HTMLElement;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' });
    ic.animate([
      { transform: 'translateY(-60px) scale(.6)', opacity: 0 },
      { transform: 'translateY(0) scale(1.08)', opacity: 1, offset: .45 },
      { transform: 'translateY(-14px) scale(.98)', offset: .65 },
      { transform: 'translateY(0) scale(1)', offset: .82 },
      { transform: 'translateY(0) scale(1)', opacity: 1 },
    ], { duration: 700, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).finished.then(() => {
      nav('/teacher/payments');
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-in', fill: 'forwards' }).finished.then(() => el.remove());
    });
  };
  return <div className="rp-foot"><Link to="/teacher/payments" className="rp-all" onClick={go}>查看所有付款記錄 <span aria-hidden="true">›</span></Link></div>;
}
