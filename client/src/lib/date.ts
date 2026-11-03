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

/** 11/10（二） */
export function fmtDate(iso: string): string {
  const { m, d } = parts(iso);
  return `${m}/${d}（${wd(iso)}）`;
}
/** 11/10（二）19:00 */
export function fmtSlot(iso: string, time: string): string { return `${fmtDate(iso)}${time}`; }

export function fmtMoney(n: number): string { return `NT$ ${n.toLocaleString('en-US')}`; }

export function fmtRelative(isoDateTime: string, now = new Date()): string {
  const t = new Date(isoDateTime);
  const today = studioToday(now);
  const day = studioToday(t);
  const time = studioNowTime(t);
  if (day === today) return `今天 ${time}`;
  if (day === addDays(today, -1)) return `昨天 ${time}`;
  const { m, d } = parts(day);
  return `${m}/${d}`;
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
