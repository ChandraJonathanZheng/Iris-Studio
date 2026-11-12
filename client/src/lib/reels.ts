// 精彩片段 rules shared by the UI and the mock API. The server (ReelEndpoints.cs) has the same rules and is the one that counts;
// these copies only give instant feedback while Iris types.

export const MAX_REELS = 8;
export const MAX_THUMB_BYTES = 5 * 1024 * 1024;
export const THUMB_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** instagram.com/reel/CODE, /reels/CODE, /p/CODE, /username/reel/CODE — with or without www./m. and ?igsh=… */
const REEL_LINK = /^https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:[A-Za-z0-9._]{1,30}\/)?(?:reels?|p)\/([A-Za-z0-9_-]{5,40})\/?(?:[?#].*)?$/i;

/** The Reel id from a pasted link, or null. */
export const reelShortcode = (url: string) => (url.trim().length > 300 ? null : REEL_LINK.exec(url.trim())?.[1] ?? null);
export const reelUrl = (code: string) => `https://www.instagram.com/reel/${code}/`;

/** Problem with a chosen cover image, or null when it's fine. */
export function thumbError(f: File): string | null {
  if (!THUMB_TYPES.includes(f.type)) return '封面只接受 JPG、PNG 或 WEBP 圖片。';
  if (f.size > MAX_THUMB_BYTES) return `封面圖片不能超過 5 MB（這張是 ${(f.size / 1024 / 1024).toFixed(1)} MB）。`;
  return null;
}
