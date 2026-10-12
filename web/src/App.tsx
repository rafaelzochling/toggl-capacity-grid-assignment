import { useEffect, useState } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { MAX_WEEKS, formatDate, isValidRange, rangeFromToday, shiftRange, startOfWeek, todayUTC, weekCount, type Range } from './weeks'

// The scaffold's window. It holds the hand-written cases in the seed
// (an exactly-full week, a weekend split, an over-allocation, a person
// with zero hours), so it stays the default; "This week" is one click.
const DEFAULT_RANGE: Range = { from: '2025-12-29', to: '2026-01-16' }

// The range is page state, not grid state: the team overview this grid
// will live in shares it with a timeline. It is mirrored to the URL so a
// view can be bookmarked, and replaced rather than pushed so stepping
// through weeks does not pile up browser history.
function readRange(search: string): Range {
  const q = new URLSearchParams(search)
  const r = { from: q.get('from') ?? '', to: q.get('to') ?? '' }
  return isValidRange(r) && weekCount(r) <= MAX_WEEKS ? r : DEFAULT_RANGE
}

export function App() {
  const [range, setRange] = useState<Range>(() => readRange(window.location.search))
  const [hint, setHint] = useState<string | null>(null)
  const today = todayUTC()
  const currentWeek = formatDate(startOfWeek(today))

  useEffect(() => {
    const q = new URLSearchParams(range).toString()
    window.history.replaceState(null, '', `?${q}`)
  }, [range])

  // The API caps a request at MAX_WEEKS; refusing the change here is
  // better than letting the grid ask for a range it will be told off for.
  const setEnd = (key: keyof Range, value: string) => {
    const next = { ...range, [key]: value }
    if (!isValidRange(next)) return
    if (weekCount(next) > MAX_WEEKS) {
      setHint(`Pick at most ${MAX_WEEKS} weeks`)
      return
    }
    setHint(null)
    setRange(next)
  }

  return (
    <main>
      <h1>Team capacity</h1>
      <nav className="range" aria-label="Date range">
        <button type="button" onClick={() => setRange(shiftRange(range, -7))} aria-label="Previous week">
          ◀ Week
        </button>
        <button type="button" onClick={() => setRange(shiftRange(range, 7))} aria-label="Next week">
          Week ▶
        </button>
        <button type="button" onClick={() => setRange(rangeFromToday(today, range))}>
          This week
        </button>
        <label>
          From <input type="date" value={range.from} max={range.to} onChange={(e) => setEnd('from', e.target.value)} />
        </label>
        <label>
          To <input type="date" value={range.to} min={range.from} onChange={(e) => setEnd('to', e.target.value)} />
        </label>
        {hint && <span className="hint">{hint}</span>}
      </nav>
      <CapacityGrid from={range.from} to={range.to} currentWeek={currentWeek} />
    </main>
  )
}
