import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RescheduleModal from '@/components/RescheduleModal'
import type { RescheduleRequest } from '@/lib/types'

const request: RescheduleRequest = {
  id: 'r1',
  student_id: 's1',
  class_id: 'c1',
  current_time: '2026-08-20T11:00:00+08:00',
  requested_time: '2026-08-21T17:30:00+08:00',
  reason: 'Choir rehearsal moved to Wednesday this week.',
  status: 'pending',
  created_at: '2026-08-18T00:00:00Z',
}

describe('RescheduleModal', () => {
  it('calls onApprove when Approve move is clicked', () => {
    const onApprove = vi.fn()
    render(
      <RescheduleModal
        request={request}
        studentName="Kenji Lin"
        onApprove={onApprove}
        onDecline={() => {}}
        onDismiss={() => {}}
      />
    )
    fireEvent.click(screen.getByText('Approve move'))
    expect(onApprove).toHaveBeenCalledWith('r1')
  })

  it('calls onDecline when Can\'t do it is clicked', () => {
    const onDecline = vi.fn()
    render(
      <RescheduleModal
        request={request}
        studentName="Kenji Lin"
        onApprove={() => {}}
        onDecline={onDecline}
        onDismiss={() => {}}
      />
    )
    fireEvent.click(screen.getByText("Can't do it"))
    expect(onDecline).toHaveBeenCalledWith('r1')
  })
})
