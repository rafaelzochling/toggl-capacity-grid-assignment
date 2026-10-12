import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CapacityGrid } from './CapacityGrid'
import type { CapacityResponse } from './api'

const response = (people: CapacityResponse['people']): CapacityResponse => ({
  from: '2025-12-29',
  to: '2026-01-04',
  weeks: ['2025-12-29'],
  people,
  nextCursor: null,
})

const ana = { id: 1, name: 'Ana Ferreira', weeklyHours: 40, cells: [{ allocated: 40, capacity: 40 }] }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CapacityGrid', () => {
  it('keeps the typed value and offers retry when a save fails, then applies the server answer', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(json(response([ana])))
    render(<CapacityGrid from="2025-12-29" to="2026-01-04" currentWeek="2025-12-29" />)
    await screen.findByText('Ana Ferreira')

    fireEvent.click(screen.getByRole('button', { name: /edit weekly hours for ana/i }))
    const input = screen.getByLabelText(/weekly hours for ana/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '32' } })

    fetchMock.mockResolvedValueOnce(new Response('db is down', { status: 500 }))
    fireEvent.submit(input.closest('form')!)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('db is down')
    expect(input.value).toBe('32') // draft survives
    expect(screen.getByText('40')).toBeTruthy() // the cell still shows the confirmed number

    fetchMock.mockResolvedValueOnce(json({ id: 1, name: 'Ana Ferreira', weeklyHours: 32 }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByRole('button', { name: /edit weekly hours/i }).textContent).toBe('32'))
    // Capacity followed the save; allocation did not move, so 40 on 32 is now over.
    expect(screen.getByText(/over/i)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('ignores a slow response for a range the user already left', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    let resolveSlow: (r: Response) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => (resolveSlow = res)))
    const { rerender } = render(<CapacityGrid from="2025-12-29" to="2026-01-04" currentWeek="2025-12-29" />)

    fetchMock.mockResolvedValueOnce(json(response([{ ...ana, name: 'Second range' }])))
    rerender(<CapacityGrid from="2026-01-05" to="2026-01-11" currentWeek="2025-12-29" />)
    await screen.findByText('Second range')

    resolveSlow(json(response([{ ...ana, name: 'First range, late' }])))
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByText('First range, late')).toBeNull()
    expect(screen.getByText('Second range')).toBeTruthy()
  })
})
