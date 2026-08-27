import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StarRating from '@/components/StarRating'

describe('StarRating', () => {
  it('calls onChange with the clicked star value', () => {
    const onChange = vi.fn()
    render(<StarRating value={0} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Rate 4 stars'))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('renders 5 stars, filling up to value', () => {
    render(<StarRating value={3} onChange={() => {}} />)
    const filled = screen.getAllByText('★').filter((el) => el.className.includes('text-amber'))
    expect(filled).toHaveLength(3)
  })
})
