import { useEffect, useSyncExternalStore } from 'react';

/**
 * Full-screen "please wait" layer for 登入 / 登出: white 30% veil + blur over everything, a white spinner in the middle.
 * A tiny global counter (not React state) so any code — a page or a query hook — can switch it on/off.
 */
let count = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const busy = {
  start() { count++; emit(); },
  stop() { count = Math.max(0, count - 1); emit(); },
};
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** Turn the overlay on while `on` is true (e.g. a form's submitting flag). */
export function useBusyOverlay(on: boolean) {
  useEffect(() => { if (!on) return; busy.start(); return () => busy.stop(); }, [on]);
}

export function BusyOverlay() {
  const n = useSyncExternalStore(subscribe, () => count, () => 0);
  if (!n) return null;
  return (
    <div className="busy" role="status" aria-live="assertive">
      <span className="busy-spin" aria-hidden="true" />
      <span className="sr-only">處理中，請稍候…</span>
    </div>
  );
}
