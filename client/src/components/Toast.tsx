import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Undo instead of "are you sure" (DESIGN-SYSTEM §9): the action has already happened,
 * the toast offers 復原 for 5 s. The timer pauses while the toast is hovered or focused.
 */
interface ToastInput { text: string; kind?: 'ok' | 'error'; undo?: () => void | Promise<void> }
interface ToastState extends ToastInput { id: number }

const Ctx = createContext<(t: ToastInput) => void>(() => undefined);
export const useToast = () => useContext(Ctx);

const VISIBLE_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number>(0);
  const seq = useRef(0);

  const arm = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), VISIBLE_MS);
  }, []);
  const show = useCallback((t: ToastInput) => { setToast({ ...t, id: ++seq.current }); arm(); }, [arm]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div key={toast.id} className={`toast frosted ${toast.kind === 'error' ? 'error' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}
          onMouseEnter={() => window.clearTimeout(timer.current)} onMouseLeave={arm}
          onFocus={() => window.clearTimeout(timer.current)} onBlur={arm}>
          <span className="t-ic"><Icon name={toast.kind === 'error' ? 'x' : 'check'} size={14} weight="bold" /></span>
          <span>{toast.text}</span>
          {toast.undo && (
            <button onClick={async () => { const u = toast.undo!; setToast(null); try { await u(); } catch { show({ text: '復原失敗，請重新整理後再試。', kind: 'error' }); } }}>復原</button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
