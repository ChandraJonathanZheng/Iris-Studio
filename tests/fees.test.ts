import { describe, it, expect } from 'vitest'
import { computeOutstandingCents } from '@/lib/fees'
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
