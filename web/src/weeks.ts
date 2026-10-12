// Date helpers for the grid. Everything is a YYYY-MM-DD string at the
// edges and a UTC Date in the middle, so a browser's local timezone can
// never shift a Monday into a Sunday.

export type Range = { from: string; to: string }

/** The API serves at most this many weeks per request. */
export const MAX_WEEKS = 26

const DAY_MS = 86_400_000

export function parseDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) || formatDate(d) !== s ? null : d
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS)
}

/** Monday on or before d. */
export function startOfWeek(d: Date): Date {
  return addDays(d, -((d.getUTCDay() + 6) % 7))
}

export function isValidRange(r: Range): boolean {
  const f = parseDate(r.from)
  const t = parseDate(r.to)
  return f !== null && t !== null && t >= f
}

/** Move both ends of a valid range by a number of days. */
export function shiftRange(r: Range, days: number): Range {
  return {
    from: formatDate(addDays(parseDate(r.from)!, days)),
    to: formatDate(addDays(parseDate(r.to)!, days)),
  }
}

/** A range starting on this week's Monday, keeping the given range's width. */
export function rangeFromToday(today: Date, r: Range): Range {
  const width = parseDate(r.to)!.getTime() - parseDate(r.from)!.getTime()
  const from = startOfWeek(today)
  return { from: formatDate(from), to: formatDate(new Date(from.getTime() + width)) }
}

/** "29 Dec" style label for a week column. */
export function weekLabel(iso: string): string {
  const d = parseDate(iso)!
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Today as a UTC date, so the UTC helpers see the local calendar day. */
export function todayUTC(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

/** Whole weeks a valid range covers once snapped outward to Mon..Sun. */
export function weekCount(r: Range): number {
  const from = startOfWeek(parseDate(r.from)!)
  const to = startOfWeek(parseDate(r.to)!)
  return (to.getTime() - from.getTime()) / (7 * DAY_MS) + 1
}
