import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuickNoteChips from '@/components/QuickNoteChips'

describe('QuickNoteChips', () => {
  it('calls onToggle with the clicked option', () => {
    const onToggle = vi.fn()
    render(
      <QuickNoteChips options={['Lovely tone', 'Watch the pitch']} selected={[]} onToggle={onToggle} />
    )
    fireEvent.click(screen.getByText('Lovely tone'))
    expect(onToggle).toHaveBeenCalledWith('Lovely tone')
  })

  it('visually marks selected options', () => {
    render(
      <QuickNoteChips
        options={['Lovely tone', 'Watch the pitch']}
        selected={['Lovely tone']}
        onToggle={() => {}}
      />
    )
    expect(screen.getByText('Lovely tone')).toHaveClass('bg-ink')
  })
})
