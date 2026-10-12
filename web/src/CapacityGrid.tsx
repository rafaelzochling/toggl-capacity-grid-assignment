import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchCapacity, type CapacityResponse, type PersonSummary } from './api'
import { WeeklyHoursCell } from './WeeklyHoursCell'
import { weekLabel } from './weeks'

type Props = {
  from: string
  to: string
  /** Monday of the current week, highlighted so "next week" is easy to find. */
  currentWeek: string
}

type Load =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }

// CapacityGrid renders one row per person and one column per week.
// The last good response stays on screen while a new range loads or fails,
// so the manager never looks at an empty table because of a slow network.
export function CapacityGrid({ from, to, currentWeek }: Props) {
  const [data, setData] = useState<CapacityResponse | null>(null)
  const [load, setLoad] = useState<Load>({ status: 'idle' })
  // Ranges already seen this session. Keyed by the requested range, so
  // stepping back a week is instant and never refetches.
  const cache = useRef(new Map<string, CapacityResponse>())
  // Only the latest request may update the screen: a slow response for an
  // earlier range must not overwrite a faster one for the current range.
  const latest = useRef(0)

  const loadRange = useCallback((from: string, to: string) => {
    const key = `${from}|${to}`
    const hit = cache.current.get(key)
    if (hit) {
      setData(hit)
      setLoad({ status: 'ready' })
      return () => {}
    }
    const id = ++latest.current
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    fetchCapacity(from, to, controller.signal).then(
      (res) => {
        if (id !== latest.current) return
        cache.current.set(key, res)
        setData(res)
        setLoad({ status: 'ready' })
      },
      (err: unknown) => {
        if (id !== latest.current || controller.signal.aborted) return
        setLoad({ status: 'error', message: describe(err) })
      },
    )
    return () => controller.abort()
  }, [])

  useEffect(() => loadRange(from, to), [from, to, loadRange])

  // After a save the server has told us the new weekly hours, and nothing
  // else changed: allocation does not depend on capacity. So the row is
  // patched from the response. Other cached ranges are dropped rather than
  // patched, so they stay correct even if capacity ever becomes per-week.
  const onSaved = (saved: PersonSummary) => {
    setData((cur) => {
      if (!cur) return cur
      const next = {
        ...cur,
        people: cur.people.map((p) =>
          p.id === saved.id
            ? { ...p, weeklyHours: saved.weeklyHours, cells: p.cells.map((c) => ({ ...c, capacity: saved.weeklyHours })) }
            : p,
        ),
      }
      cache.current.clear()
      cache.current.set(`${from}|${to}`, next)
      return next
    })
  }

  const retry = () => {
    cache.current.delete(`${from}|${to}`)
    loadRange(from, to)
  }

  const overCount = data ? data.people.filter((p) => p.cells.some((c) => c.allocated > c.capacity)).length : 0

  return (
    <section className="grid" aria-busy={load.status === 'loading'}>
      <div className="status" role="status">
        {load.status === 'loading' && <span>Loading…</span>}
        {load.status === 'error' && (
          <span className="error">
            Could not load capacity: {load.message}{' '}
            <button type="button" onClick={retry}>
              Retry
            </button>
          </span>
        )}
        {load.status === 'ready' && data && (
          <span>
            {data.people.length} people
            {data.nextCursor !== null && ' (first page)'}, {overCount} over-allocated in this range
          </span>
        )}
      </div>

      {data && (
        <table className={load.status === 'loading' ? 'stale' : undefined}>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col" className="num">
                Hours / week
              </th>
              {data.weeks.map((w) => (
                <th key={w} scope="col" className={`num${w === currentWeek ? ' current' : ''}`} title={w}>
                  {weekLabel(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.people.map((p) => (
              <tr key={p.id}>
                <th scope="row">{p.name}</th>
                <WeeklyHoursCell person={p} onSaved={onSaved} />
                {p.cells.map((c, i) => (
                  <td key={data.weeks[i]} className={`num ${cellClass(c.allocated, c.capacity)}`}>
                    {c.allocated === 0 ? '–' : c.allocated}
                    {c.allocated > c.capacity && <span className="flag"> over</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function cellClass(allocated: number, capacity: number): string {
  if (allocated === 0) return 'empty'
  if (allocated > capacity) return 'over'
  if (allocated === capacity) return 'full'
  return ''
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return `${err.status} ${err.message}`
  if (err instanceof Error) return err.message
  return 'unknown error'
}
