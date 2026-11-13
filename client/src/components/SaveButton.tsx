import { useEffect, useRef, useState } from 'react';

/**
 * One 儲存 behaviour for the whole app (first built for the IG Reels edit page):
 *   idle → saving: the label falls back + fades, three blue dots bounce one after another
 *        → saved:  dots fade, a check mark draws itself + "Saved"
 *        → then `after()` runs (close the sheet / go back) and the button is ready again.
 * saving lasts at least 900 ms so the dots are seen even on a fast network; saved holds 1.3 s.
 * If the save fails, the button goes straight back to idle and the error is re-thrown for the caller's toast.
 */
export type SaveState = 'idle' | 'saving' | 'saved';
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const reduce = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useSaveFlow() {
  const [state, setState] = useState<SaveState>('idle');
  const live = useRef(true);
  const busy = useRef(false); // ref, not state: a fast double-tap must not start two saves
  useEffect(() => () => { live.current = false; }, []);
  const run = async <T,>(work: () => Promise<T> | T, after?: (result: T) => void): Promise<T | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setState('saving');
    let result: T;
    try {
      [result] = await Promise.all([Promise.resolve().then(work), wait(reduce() ? 0 : 900)]);
    } catch (e) {
      busy.current = false;
      if (live.current) setState('idle');
      throw e;
    }
    if (live.current) setState('saved');
    await wait(reduce() ? 500 : 1300);
    busy.current = false;
    after?.(result);
    if (live.current) setState('idle');
    return result;
  };
  return { state, run, busy: state !== 'idle' };
}

export function SaveButton({ state, label = '儲存', className = 'btn primary block', type = 'submit', disabled, onClick }: {
  state: SaveState; label?: string; className?: string; type?: 'submit' | 'button'; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <button type={type} className={`${className} save-anim is-${state}`} disabled={disabled || state !== 'idle'} aria-disabled={state !== 'idle' || undefined}
      onClick={onClick} data-state={state}>
      <span className="save-txt">{label}</span>
      <span className="save-dots" aria-hidden="true"><i /><i /><i /></span>
      <span className="save-done" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Saved
      </span>
      <span className="sr-only" role="status">{state === 'saving' ? '儲存中…' : state === 'saved' ? '已儲存' : ''}</span>
    </button>
  );
}
