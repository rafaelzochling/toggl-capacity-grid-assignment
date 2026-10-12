import { describe, expect, it } from 'vitest'
import { isValidRange, parseDate, rangeFromToday, shiftRange, startOfWeek, formatDate } from './weeks'

describe('weeks', () => {
  it('finds the Monday of a week in UTC, including for a Sunday', () => {
    expect(formatDate(startOfWeek(parseDate('2026-01-04')!))).toBe('2025-12-29') // Sunday
    expect(formatDate(startOfWeek(parseDate('2025-12-29')!))).toBe('2025-12-29') // Monday
    expect(formatDate(startOfWeek(parseDate('2026-01-16')!))).toBe('2026-01-12') // Friday
  })

  it('shifts a range by whole weeks without changing its width', () => {
    const r = { from: '2025-12-29', to: '2026-01-16' }
    expect(shiftRange(r, 7)).toEqual({ from: '2026-01-05', to: '2026-01-23' })
    expect(shiftRange(r, -7)).toEqual({ from: '2025-12-22', to: '2026-01-09' })
  })

  it('anchors a range on the current week keeping its width', () => {
    const r = { from: '2025-12-29', to: '2026-01-16' }
    expect(rangeFromToday(parseDate('2026-10-14')!, r)).toEqual({ from: '2026-10-12', to: '2026-10-30' })
  })

  it('rejects malformed and reversed ranges', () => {
    expect(isValidRange({ from: '2026-01-10', to: '2026-01-01' })).toBe(false)
    expect(isValidRange({ from: '2026-02-30', to: '2026-03-01' })).toBe(false)
    expect(isValidRange({ from: 'yesterday', to: '2026-03-01' })).toBe(false)
    expect(isValidRange({ from: '2026-01-01', to: '2026-01-01' })).toBe(true)
  })
})
