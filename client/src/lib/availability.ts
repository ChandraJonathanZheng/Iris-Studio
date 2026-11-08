// Iris's availability → bookable slots. Pure functions, no I/O.
// The mock API uses these, and server/IrisStudio.Api/Services/AvailabilityService.cs implements the same rules,
// so what Iris previews on her settings page is exactly what students can book.
import type { Availability, TimeRange } from './types';

/** "10:30" → 630 */
export const toMin = (t: string): number => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
/** 630 → "10:30" */
export const toTime = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 0 = Sunday … 6 = Saturday (same as Date.getDay and .NET DayOfWeek). */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Which ranges apply on a date: a special date wins over the weekly pattern. */
export function rangesFor(av: Availability, date: string): TimeRange[] {
  const o = av.overrides.find((x) => x.date === date);
  if (o) return o.closed ? [] : o.ranges;
  const w = av.weekly.find((x) => x.weekday === weekdayOf(date));
  return w && w.enabled ? w.ranges : [];
}

/**
 * Start times inside one range. A lesson must FIT inside the range (start + length ≤ end),
 * and the next one starts after the lesson + the break: 10:00–12:00, 60 min, 30 min break → 10:00 only;
 * 10:00–13:00 → 10:00, 11:30.
 */
export function startsInRange(r: TimeRange, lessonMinutes: number, gapMinutes: number): string[] {
  const out: string[] = [];
  const end = toMin(r.end);
  for (let s = toMin(r.start); s + lessonMinutes <= end; s += lessonMinutes + gapMinutes) out.push(toTime(s));
  return out;
}

/** All generated start times for a date, sorted, no duplicates. */
export function slotTimesFor(av: Availability, date: string): string[] {
  const { lessonMinutes, gapMinutes } = av.settings;
  const set = new Set(rangesFor(av, date).flatMap((r) => startsInRange(r, lessonMinutes, gapMinutes)));
  return [...set].sort();
}

/**
 * Does a new lesson at `time` clash with a booked lesson? The break counts on both sides, so a lesson booked
 * before a settings change (different grid) still blocks every slot that would touch it.
 */
export function overlaps(time: string, minutes: number, booked: { time: string; minutes: number }, gapMinutes: number): boolean {
  const a = toMin(time), b = toMin(booked.time);
  return a < b + booked.minutes + gapMinutes && b < a + minutes + gapMinutes;
}

/** Problems with one day's ranges, in the words shown to Iris (empty = fine). */
export function rangeProblems(ranges: TimeRange[], lessonMinutes: number): string[] {
  const out: string[] = [];
  const sorted = [...ranges].sort((x, y) => toMin(x.start) - toMin(y.start));
  sorted.forEach((r, i) => {
    if (toMin(r.end) <= toMin(r.start)) out.push(`${r.start}–${r.end}：結束時間要晚於開始時間。`);
    else if (toMin(r.end) - toMin(r.start) < lessonMinutes) out.push(`${r.start}–${r.end} 比一堂課（${lessonMinutes} 分鐘）短，排不進課。`);
    const prev = sorted[i - 1];
    if (prev && toMin(r.start) < toMin(prev.end)) out.push(`${prev.start}–${prev.end} 和 ${r.start}–${r.end} 重疊了。`);
  });
  return out;
}

/** Half-hour options for the time pickers (07:00 … 23:00). */
export const TIME_OPTIONS: string[] = Array.from({ length: 33 }, (_, i) => toTime(7 * 60 + i * 30));

export const WEEKDAY_LABEL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
/** Monday-first display order. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
