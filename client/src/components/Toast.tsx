import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * App-wide alert (toast). Three kinds, one motion:
 *   success → green, white text, ✓      (default)
 *   warning → yellow, black text, !
 *   error   → red, white text, ✕
 * It drops in from the top with a quick fade, stays 1.5 s, then rises back up and fades out quickly.
 * A toast with 復原 (undo) stays 5 s instead — 1.5 s is too short to reach the button.
 * The timer pauses while the toast is hovered or focused, so slow readers and keyboard users don't lose it.
 */
type Kind = 'success' | 'warning' | 'error';
interface ToastInput {
  text: string;
  /** 'ok' is the old name for success */
  kind?: Kind | 'ok';
  undo?: () => void | Promise<void>;
}
interface ToastState { text: string; kind: Kind; undo?: ToastInput['undo']; id: number; leaving: boolean }

const STAY_MS = 1500, UNDO_MS = 5000, OUT_MS = 200;
const ICON: Record<Kind, string> = { success: 'check', warning: 'warning', error: 'x' };

const Ctx = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const outTimer = useRef<number | undefined>(undefined);
  const paused = useRef(false);
  const seq = useRef(0);

  // leave = play the "rise + fade out" first, then remove it
  const close = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast((t) => (t ? { ...t, leaving: true } : t));
    window.clearTimeout(outTimer.current);
    outTimer.current = window.setTimeout(() => setToast(null), OUT_MS);
  }, []);
  const arm = useCallback((ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (!paused.current) close(); }, ms);
  }, [close]);

  const show = useCallback((t: ToastInput) => {
    seq.current += 1;
    paused.current = false; // a new toast starts its own timer, even if the pointer is still resting where the last one was
    window.clearTimeout(outTimer.current);
    const kind: Kind = t.kind === 'error' ? 'error' : t.kind === 'warning' ? 'warning' : 'success';
    setToast({ text: t.text, kind, undo: t.undo, id: seq.current, leaving: false });
    arm(t.undo ? UNDO_MS : STAY_MS);
  }, [arm]);

  useEffect(() => () => { window.clearTimeout(timer.current); window.clearTimeout(outTimer.current); }, []);

  const pause = () => { paused.current = true; window.clearTimeout(timer.current); };
  const resume = () => { paused.current = false; arm(STAY_MS); };

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toast && (
          <div
            key={toast.id}
            className={`toast is-${toast.kind}${toast.kind === 'error' ? ' error' : ''}${toast.leaving ? ' is-leaving' : ''}`}
            role={toast.kind === 'success' ? 'status' : 'alert'}
            onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={resume}
          >
            <span className="ti" aria-hidden="true"><Icon name={ICON[toast.kind]} size={18} weight="bold" /></span>
            <span className="grow">{toast.text}</span>
            {toast.undo && (
              <button
                className="undo"
                onClick={async () => {
                  const fn = toast.undo!;
                  close();
                  try { await fn(); show({ text: '已復原' }); }
                  catch { show({ text: '復原失敗，可能已超過時間。', kind: 'error' }); }
                }}
              >復原</button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
