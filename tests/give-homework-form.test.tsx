import { describe, it, expect } from 'vitest'
import { validateGiveHomeworkForm } from '@/lib/giveHomeworkValidation'

describe('validateGiveHomeworkForm', () => {
  it('requires at least one selected student', () => {
    const result = validateGiveHomeworkForm({
      studentIds: [],
      title: 'Scales',
      dueDate: '2026-08-25',
      minutesPerDay: 10,
    })
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('expected invalid result')
    expect(result.error).toMatch(/student/i)
  })

  it('requires a non-empty title', () => {
    const result = validateGiveHomeworkForm({
      studentIds: ['s1'],
      title: '  ',
      dueDate: '2026-08-25',
      minutesPerDay: 10,
    })
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('expected invalid result')
    expect(result.error).toMatch(/task/i)
  })

  it('accepts a fully filled form', () => {
    const result = validateGiveHomeworkForm({
      studentIds: ['s1', 's2'],
      title: 'Sirens + lip trills, full range',
      dueDate: '2026-08-25',
      minutesPerDay: 10,
    })
    expect(result.valid).toBe(true)
  })
})
