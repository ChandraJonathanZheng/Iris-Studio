import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * #5 Undo instead of "are you sure".
 * The action has already happened; the toast offers 復原 (undo) for 5 s.
 * The timer pauses while the toast is hovered or focused, so slow readers and keyboard users don't lose the chance.
 */
interface ToastInput {
  text: string;
  kind?: 'ok' | 'error';
  undo?: () => void | Promise<void>;
}
interface ToastState extends ToastInput { id: number }

const Ctx = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const paused = useRef(false);
  const seq = useRef(0);

  const close = useCallback(() => setToast(null), []);
  const arm = useCallback((ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (!paused.current) close(); }, ms);
  }, [close]);

  const show = useCallback((t: ToastInput) => {
    seq.current += 1;
    setToast({ ...t, id: seq.current });
    arm(t.undo ? 5000 : t.kind === 'error' ? 6000 : 3000);
  }, [arm]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const pause = () => { paused.current = true; window.clearTimeout(timer.current); };
  const resume = () => { paused.current = false; arm(2000); };

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toast && (
          <div
            key={toast.id}
            className={`toast${toast.kind === 'error' ? ' error' : ''}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={resume}
          >
            <span className="ti" aria-hidden="true"><Icon name={toast.kind === 'error' ? 'x' : 'check'} size={16} /></span>
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
            {toast.kind === 'error' && (
              <button className="icon-btn flat small" aria-label="關閉" onClick={close}><Icon name="x" size={16} /></button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
