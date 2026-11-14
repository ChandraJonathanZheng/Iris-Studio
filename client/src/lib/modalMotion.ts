// One close motion for every <dialog> modal in the app (收據 viewers, 課堂筆記, 給筆記, 停用, 刪除 Reel, Reel player,
// done dialog, LINE ID help…), so they all leave the same way:
//   1) a quick small swell (→ 104 %, a "breath in"),
//   2) then it shrinks smaller and smaller — back into the button/text it was opened from when we know it —
//      while fading out gradually (opacity falls along the whole shrink, not in one step at the end).
// The backdrop (::backdrop, or the dialog's own shade layer) fades on the same clock, and the real dialog.close()
// runs only when the motion has finished. Reduced motion → a short plain fade.

const openers = new WeakMap<HTMLDialogElement, HTMLElement>();
const DUR = 420;

/** showModal() + remember what had focus, so closeModal() knows where to shrink back to. */
export function openModal(d: HTMLDialogElement | null | undefined) {
  if (!d || d.open) return;
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) openers.set(d, document.activeElement);
  d.showModal();
}

type Origin = HTMLElement | DOMRect | null | undefined;

/**
 * Animate, then close. Safe to call twice (the second call is ignored while closing).
 * box: the visible panel (default: the dialog's first child that isn't a shade). shade: an inner backdrop layer, if the
 * dialog draws its own instead of ::backdrop. from: where to shrink to (default: the element that opened it).
 */
export function closeModal(d: HTMLDialogElement | null | undefined, opts: { box?: HTMLElement | null; shade?: HTMLElement | null; from?: Origin } = {}): Promise<void> {
  if (!d || !d.open) return Promise.resolve();
  if (d.dataset.closing) return Promise.resolve();
  d.dataset.closing = '1';
  const anims: Animation[] = [];
  // close, then drop the end frame — a dialog that stays mounted (e.g. the LINE ID help) must reopen at full size
  const finish = () => { delete d.dataset.closing; if (d.open) d.close(); anims.forEach((a) => a.cancel()); };

  const box = opts.box ?? ([...d.children].find((c) => !/shade/.test(c.className)) as HTMLElement | undefined) ?? d;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fade = (el: Element, ms: number, pseudo?: string) => {
    try { const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-in', fill: 'forwards', pseudoElement: pseudo }); anims.push(a); return a; }
    catch { return null; } // old browsers can't animate ::backdrop — it then simply disappears with the dialog
  };

  if (reduce) {
    if (opts.shade) fade(opts.shade, 140); else fade(d, 140, '::backdrop');
    const a = fade(box, 140);
    return (a ? a.finished : Promise.resolve()).then(finish, finish);
  }

  // where to shrink to: the origin's centre, relative to the panel's centre (none → shrink in place)
  const fromEl = opts.from ?? openers.get(d);
  const o = fromEl instanceof DOMRect ? fromEl : fromEl?.isConnected ? fromEl.getBoundingClientRect() : null;
  const b = box.getBoundingClientRect();
  const dx = o && o.width ? o.left + o.width / 2 - (b.left + b.width / 2) : 0;
  const dy = o && o.width ? o.top + o.height / 2 - (b.top + b.height / 2) : 0;
  const at = (k: number) => `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`;

  const anim = box.animate([
    { transform: `${at(0)} scale(1)`, opacity: 1, offset: 0 },
    { transform: `${at(0)} scale(1.04)`, opacity: 1, offset: 0.16, easing: 'cubic-bezier(.45,0,.8,.4)' },  // swell
    { transform: `${at(0.45)} scale(0.6)`, opacity: 0.75, offset: 0.55 },                                 // shrinking…
    { transform: `${at(0.85)} scale(0.22)`, opacity: 0.3, offset: 0.85 },                                 // …smaller, fainter
    { transform: `${at(1)} scale(0.04)`, opacity: 0, offset: 1 },                                         // gone, at the origin
  ], { duration: DUR, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
  anims.push(anim);
  if (opts.shade) fade(opts.shade, DUR); else fade(d, DUR, '::backdrop');
  return anim.finished.then(finish, finish);
}
