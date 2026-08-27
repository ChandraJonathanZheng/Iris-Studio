import type { FeePayment } from './types'

export function computeOutstandingCents(payments: FeePayment[], cycleFeeCents: number): number {
  const unpaidWeeks = payments.filter((p) => !p.paid).length
  const perWeekCents = cycleFeeCents / 4
  return Math.round(unpaidWeeks * perWeekCents)
}

export function computeUnpaidCents(
  paymentsByStudent: Record<string, FeePayment[]>,
  feeCentsByStudent: Record<string, number>
): number {
  return Object.entries(paymentsByStudent).reduce((total, [studentId, payments]) => {
    return total + computeOutstandingCents(payments, feeCentsByStudent[studentId] ?? 0)
  }, 0)
}
