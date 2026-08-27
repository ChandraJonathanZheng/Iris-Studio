import { describe, it, expect } from 'vitest'
import { computeOutstandingCents, computeUnpaidCents } from '@/lib/fees'
import type { FeePayment } from '@/lib/types'

function payment(week: number, paid: boolean): FeePayment {
  return {
    id: `p${week}`,
    student_id: 's1',
    cycle_id: 'c1',
    week_number: week,
    paid,
    paid_at: null,
  }
}

describe('computeOutstandingCents', () => {
  it('charges one quarter of the cycle fee per unpaid week', () => {
    const payments = [payment(1, true), payment(2, true), payment(3, false), payment(4, false)]
    expect(computeOutstandingCents(payments, 320000)).toBe(160000)
  })

  it('returns 0 when all weeks are paid', () => {
    const payments = [payment(1, true), payment(2, true), payment(3, true), payment(4, true)]
    expect(computeOutstandingCents(payments, 320000)).toBe(0)
  })

})

describe('computeUnpaidCents', () => {
  it('counts a student with no fee_payments rows this cycle as fully unpaid', () => {
    // Regression test: the roster must include every student with a class assignment,
    // even ones with zero payment rows for the current cycle — not just students who
    // already have rows in paymentsByStudent. Since computeOutstandingCents([], fee) is 0
    // (it counts explicit `paid: false` rows, not missing rows), the caller must synthesize
    // 4 unpaid-week rows for a student with no rows at all.
    const missingStudentSyntheticRows: FeePayment[] = [
      payment(1, false),
      payment(2, false),
      payment(3, false),
      payment(4, false),
    ]
    const paymentsByStudent: Record<string, FeePayment[]> = {
      s1: [payment(1, true), payment(2, true), payment(3, false), payment(4, false)],
      s2: missingStudentSyntheticRows,
    }
    const feeCentsByStudent: Record<string, number> = { s1: 320000, s2: 320000 }
    expect(computeUnpaidCents(paymentsByStudent, feeCentsByStudent)).toBe(160000 + 320000)
  })
})
