import type { Lesson } from './types';

/**
 * Can this lesson still be reported (回報)? Attended, no live report, and at most `reportDays`
 * (Studio:ReportDays, 7) after it ended. The server checks the same rule when the report is sent.
 */
export function canReport(l: Lesson, reportDays: number, now = Date.now()): boolean {
  if (l.status !== 'Attended' || l.report) return false;
  const end = new Date(`${l.date}T${l.time}:00+08:00`).getTime() + l.minutes * 60_000;
  return now <= end + reportDays * 86_400_000;
}

/** 取消費 actually charged for this lesson's approved report, or 0. */
export const reportFee = (l: Lesson) => (l.report?.status === 'Approved' && !l.report.feeWaived ? l.report.feeAmount : 0);
