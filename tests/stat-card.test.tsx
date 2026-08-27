import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatCard from '@/components/StatCard'

describe('StatCard', () => {
  it('renders value, label, and meta', () => {
    render(<StatCard value={3} label="Homework to review" meta="2 waiting" />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Homework to review')).toBeInTheDocument()
    expect(screen.getByText('2 waiting')).toBeInTheDocument()
  })
})
