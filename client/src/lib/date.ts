// All lesson times are studio time (Asia/Taipei), even if the browser is elsewhere.
const TZ = 'Asia/Taipei';
const WD = ['日', '一', '二', '三', '四', '五', '六'];

/** Today's date in the studio, YYYY-MM-DD */
export function studioToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function studioNowTime(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}
/** weekday of a calendar date (0 = Sunday), independent of time zone */
export function weekday(iso: string): number {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function addDays(iso: string, n: number): string {
  const { y, m, d } = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export function wd(iso: string): string { return WD[weekday(iso)]; }
export function dayNum(iso: string): number { return parts(iso).d; }
export function monthNum(iso: string): number { return parts(iso).m; }

/** Month-day, zero-padded: 11-03. One helper, so every screen uses the same format. */
export function fmtMD(iso: string): string {
  return iso.slice(5, 10); // YYYY-MM-DD → MM-DD
}
/** 11-03(二) — half-width parens: full-width （） carry built-in padding, which pushed the weekday away from the date. */
export function fmtDate(iso: string): string {
  return `${fmtMD(iso)}(${wd(iso)})`;
}
/** 11-03(二) 19:00 — a space keeps the time from gluing onto the ")" */
export function fmtSlot(iso: string, time: string): string { return `${fmtDate(iso)} ${time}`; }

export function fmtMoney(n: number): string { return `NT$ ${n.toLocaleString('en-US')}`; }

export function fmtRelative(isoDateTime: string, now = new Date()): string {
  const t = new Date(isoDateTime);
  const today = studioToday(now);
  const day = studioToday(t);
  const time = studioNowTime(t);
  if (day === today) return `今天 ${time}`;
  if (day === addDays(today, -1)) return `昨天 ${time}`;
  return fmtMD(day);
}

export function compareSlot(a: { date: string; time: string }, b: { date: string; time: string }): number {
  return (a.date + a.time).localeCompare(b.date + b.time);
}

/** 6×7 month grid starting Monday */
export function monthGrid(year: number, month: number): string[] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const offset = (weekday(first) + 6) % 7; // Monday = 0
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Avatar letter: Chinese names use the given name's last character (明), Latin names the first letter (I). */
export function initialOf(name: string): string {
  const n = name.trim();
  return /^[A-Za-z]/.test(n) ? n[0].toUpperCase() : n.slice(-1);
}

export const LESSON_TYPE_LABEL: Record<'private' | 'group' | 'trial', string> = { private: '一對一', group: '團體課', trial: '單堂課' };
/** 60 → 1 個小時, 120 → 2 個小時, 90 → 90 分鐘 */
export function fmtDuration(min: number): string {
  return min % 60 === 0 ? `${min / 60} 個小時` : `${min} 分鐘`; // 60 → 1 個小時, 120 → 2 個小時, 90 → 90 分鐘 (not "1.5 個小時")
}

/** One label set for lessons AND students' class type (decided 8 Nov): 一對一 / 團體課 / 單堂課. */
export const CLASS_TYPE_LABEL = LESSON_TYPE_LABEL;

/** 免費諮詢: when the visitor is easiest to reach (shared by the form and Iris's 諮詢 list). */
export const CONSULT_TIME_LABEL: Record<'weekdayDay' | 'weekdayEvening' | 'weekend' | 'any', string> = {
  weekdayDay: '平日白天', weekdayEvening: '平日晚上', weekend: '週末', any: '都可以',
};

/** "2026.11.12 (四)" — the date line under the student greeting. */
export function fmtDayLine(iso: string): string { return `${iso.slice(0, 10).replace(/-/g, '.')} (${wd(iso)})`; }
const EN_WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "Thursday, 16:30" — the big time on the 下一堂課 card. */
export function fmtWeekdayTime(iso: string, time: string): string { return `${EN_WD[weekday(iso)]}, ${time}`; }
/** "11-05 (四) 16:30" — list rows (spaced variant of fmtSlot). */
export function fmtSlotSpaced(iso: string, time: string): string { return `${iso.slice(5, 10)} (${wd(iso)}) ${time}`; }
/** "16:30" + 60 min → "17:30" */
export function endTime(time: string, minutes = 60): string {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
