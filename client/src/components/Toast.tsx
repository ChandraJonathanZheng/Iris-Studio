import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ToastInput { text: string; kind?: 'ok' | 'error'; undo?: () => void | Promise<void> }
interface Toast extends ToastInput { id: number }

const Ctx = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(Ctx);

/**
 * One toast at a time. With 復原 it stays 5 s, errors 6 s, others 3 s; hovering or focusing it pauses the timer
 * (then 2 s more), so a reader is never rushed.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const paused = useRef(false);
  const seq = useRef(0);
  const hide = useCallback(() => setToast(null), []);
  const schedule = useCallback((ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (!paused.current) hide(); }, ms);
  }, [hide]);
  const show = useCallback((t: ToastInput) => {
    seq.current += 1;
    setToast({ ...t, id: seq.current });
    schedule(t.undo ? 5000 : t.kind === 'error' ? 6000 : 3000);
  }, [schedule]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const pause = () => { paused.current = true; window.clearTimeout(timer.current); };
  const resume = () => { paused.current = false; schedule(2000); };

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast${toast.kind === 'error' ? ' error' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}
            onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={resume}>
            <span className="ti" aria-hidden="true"><Icon name={toast.kind === 'error' ? 'x' : 'check'} size={16} /></span>
            <span className="grow">{toast.text}</span>
            {toast.undo && (
              <button className="undo" onClick={async () => {
                const undo = toast.undo!;
                hide();
                try { await undo(); show({ text: '已復原' }); }
                catch { show({ text: '復原失敗，可能已超過時間。', kind: 'error' }); }
              }}>復原</button>
            )}
            {toast.kind === 'error' && <button className="icon-btn flat small" aria-label="關閉" onClick={hide}><Icon name="x" size={16} /></button>}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
