import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressBar, StatusBadge } from './StatusBadge'

describe('StatusBadge ProgressBar', () => {
  it('exposes progressbar semantics with clamped values', () => {
    const { rerender } = render(<ProgressBar value={42} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('aria-label', '42% complete')

    rerender(<ProgressBar value={150} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    rerender(<ProgressBar value={-5} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('renders long status labels without clipping the accessible name', () => {
    render(<StatusBadge status="awaiting_company" />)
    expect(screen.getByText('Awaiting company review')).toBeInTheDocument()
  })
})
