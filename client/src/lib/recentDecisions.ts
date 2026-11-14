// Reschedule requests Iris just decided, kept on screen as 已同意 / 已婉拒 instead of vanishing.
// The query cache drops a request the moment it's decided (optimistic update), so without this the card
// would just disappear and Iris couldn't see what she did. It's a tiny module-level store (not React state)
// because the 婉拒 sheet is a different route: it records the decision and the inbox page reads it.
import { useSyncExternalStore } from 'react';
import type { ChangeRequest } from './types';

export type Decision = { c: ChangeRequest; status: 'saving' | 'approved' | 'declined'; at: number };

const KEEP_MS = 10 * 60_000; // long enough to see it, short enough not to pile up
let map = new Map<string, Decision>();
const subs = new Set<() => void>();

export const recentDecisions = {
  set(id: string, d: Omit<Decision, 'at'> | null) {
    map = new Map(map); // new object → useSyncExternalStore sees the change
    if (d) map.set(id, { ...d, at: Date.now() }); else map.delete(id);
    subs.forEach((f) => f());
  },
  has: (id: string) => map.has(id),
};

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snapshot = () => map;

export function useRecentDecisions(): Decision[] {
  const m = useSyncExternalStore(subscribe, snapshot);
  const now = Date.now();
  return [...m.values()].filter((d) => now - d.at < KEEP_MS);
}
