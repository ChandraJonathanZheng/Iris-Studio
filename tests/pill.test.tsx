import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Pill from '@/components/Pill'

describe('Pill', () => {
  it('renders children with the requested tone class', () => {
    render(<Pill tone="coral">FEE DUE</Pill>)
    const pill = screen.getByText('FEE DUE')
    expect(pill).toHaveClass('bg-coral/20')
  })
})
