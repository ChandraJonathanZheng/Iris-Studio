import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FeesSelectionBar from '@/components/FeesSelectionBar'

describe('FeesSelectionBar', () => {
  it('shows the selected count and total, and fires onRemind', () => {
    const onRemind = vi.fn()
    render(<FeesSelectionBar count={2} totalCents={455000} onRemind={onRemind} />)
    expect(screen.getByText(/2 selected/)).toBeInTheDocument()
    expect(screen.getByText(/NT\$ 4,550/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Remind'))
    expect(onRemind).toHaveBeenCalled()
  })
})
