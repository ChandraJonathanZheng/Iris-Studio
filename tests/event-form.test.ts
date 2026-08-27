import { describe, it, expect } from 'vitest'
import { validateEventForm } from '@/lib/validateEventForm'

describe('validateEventForm', () => {
  it('requires a name', () => {
    const result = validateEventForm({ name: '', date: '2026-09-06', time: '15:00', location: 'Hall' })
    expect(result.valid).toBe(false)
  })

  it('requires a date and time', () => {
    const result = validateEventForm({ name: 'Recital', date: '', time: '', location: 'Hall' })
    expect(result.valid).toBe(false)
  })

  it('accepts a complete form', () => {
    const result = validateEventForm({ name: 'Recital', date: '2026-09-06', time: '15:00', location: 'Hall' })
    expect(result.valid).toBe(true)
  })
})
