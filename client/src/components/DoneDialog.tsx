import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from './Icon';
import { closeModal, openModal } from '../lib/modalMotion';

/**
 * Big centred "it's done" window for destructive actions (取消課程), red so it reads as "something important happened".
 *  - OK!  or a tap outside → the window shrinks to the centre + fades, the blur clears, and onDone runs (e.g. back to 行事曆).
 *  - 復原  is the big button: it calls undo() while the undo window (10 s) is still open; the countdown is shown on it.
 * Global store (like Busy/Toast) so the sheet that started the action can unmount — the dialog lives at the app root.
 */
export interface DoneInput {
  title: string;
  text: string;
  undo?: () => void | Promise<void>;
  undoSeconds?: number;
  onDone?: () => void;
  onUndone?: () => void;
}
let current: (DoneInput & { id: number }) | null = null;
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const showDone = (d: DoneInput) => { current = { ...d, id: ++seq }; emit(); };
const hide = () => { current = null; emit(); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function DoneDialogHost() {
  const d = useSyncExternalStore(subscribe, () => current, () => null);
  return d ? <DoneDialog key={d.id} d={d} /> : null;
}

function DoneDialog({ d }: { d: DoneInput }) {
  const ref = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);
  const [left, setLeft] = useState(d.undoSeconds ?? 10);
  const [undoing, setUndoing] = useState(false);
  const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    openModal(ref.current);
    if (!reduce()) {
      box.current?.animate([{ transform: 'scale(.86)', opacity: 0 }, { transform: 'scale(1.02)', opacity: 1, offset: .7 }, { transform: 'none', opacity: 1 }],
        { duration: 380, easing: 'cubic-bezier(.3,.7,.2,1)' });
      shade.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
    }
    const t = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, []);

  /** shared close motion (lib/modalMotion), then remove */
  const leave = (after?: () => void) => {
    if (leaving.current) return; leaving.current = true;
    closeModal(ref.current, { box: box.current, shade: shade.current }).then(() => { hide(); after?.(); });
  };

  const canUndo = !!d.undo && left > 0;
  return (
    <dialog ref={ref} className="dn-dlg" aria-labelledby="dn-t" aria-describedby="dn-d"
      onCancel={(e) => { e.preventDefault(); leave(d.onDone); }}
      onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('dn-shade')) leave(d.onDone); }}>
      <div className="dn-shade" ref={shade} />
      <div className="dn-box" ref={box} role="document">
        <span className="dn-ic" aria-hidden="true"><Icon name="check" size={30} weight="bold" /></span>
        <h2 id="dn-t" className="dn-t">{d.title}</h2>
        <p id="dn-d" className="dn-d">{d.text}</p>
        <div className="dn-acts">
          <button type="button" className="dn-ok" autoFocus onClick={() => leave(d.onDone)}>OK!</button>
          {d.undo && (
            <button type="button" className="dn-undo" disabled={!canUndo || undoing}
              onClick={async () => { setUndoing(true); try { await d.undo!(); leave(d.onUndone ?? d.onDone); } catch { setUndoing(false); } }}>
              <Icon name="undo" size={20} weight="bold" />
              <span>{undoing ? '復原中…' : canUndo ? `復原（${left}）` : '已通知學生'}</span>
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
