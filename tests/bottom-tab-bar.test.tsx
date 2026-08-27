import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/students',
}))

import BottomTabBar from '@/components/BottomTabBar'

describe('BottomTabBar', () => {
  it('marks the tab matching the current path as active', () => {
    render(<BottomTabBar />)
    const studentsLink = screen.getByRole('link', { name: 'Students' })
    expect(studentsLink).toHaveAttribute('aria-current', 'page')
    const homeLink = screen.getByRole('link', { name: 'Home' })
    expect(homeLink).not.toHaveAttribute('aria-current')
  })
})
