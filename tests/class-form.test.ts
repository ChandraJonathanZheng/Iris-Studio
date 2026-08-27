import { describe, it, expect } from 'vitest'
import { validateClassForm } from '@/lib/validateClassForm'

describe('validateClassForm', () => {
  it('requires a name', () => {
    const result = validateClassForm({
      name: '',
      day: 'We',
      time: '10:00',
      durationMinutes: 45,
      room: 'A',
      feeCents: 320000,
    })
    expect(result.valid).toBe(false)
  })

  it('requires positive duration and fee', () => {
    const result = validateClassForm({
      name: 'Vocal · Grade 4',
      day: 'We',
      time: '10:00',
      durationMinutes: 0,
      room: 'A',
      feeCents: 0,
    })
    expect(result.valid).toBe(false)
  })

  it('accepts a complete form', () => {
    const result = validateClassForm({
      name: 'Vocal · Grade 4',
      day: 'We',
      time: '10:00',
      durationMinutes: 45,
      room: 'A',
      feeCents: 320000,
    })
    expect(result.valid).toBe(true)
  })
})
