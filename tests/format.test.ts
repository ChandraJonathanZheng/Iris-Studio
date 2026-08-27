import { describe, it, expect } from 'vitest'
import { formatCurrency } from '@/lib/format'

describe('formatCurrency', () => {
  it('formats cents as NT$ with thousands separator', () => {
    expect(formatCurrency(695000)).toBe('NT$ 6,950')
  })

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('NT$ 0')
  })
})
