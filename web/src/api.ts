// The capacity API contract. Hours are plain numbers; cells are positional
// and line up with `weeks`.

export type CapacityCell = { allocated: number; capacity: number }

export type Person = {
  id: number
  name: string
  weeklyHours: number
  cells: CapacityCell[]
}

export type CapacityResponse = {
  from: string
  to: string
  weeks: string[]
  people: Person[]
  nextCursor: number | null
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!res.ok) {
    const text = (await res.text()).trim()
    throw new ApiError(res.status, text || `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export function fetchCapacity(from: string, to: string, signal?: AbortSignal): Promise<CapacityResponse> {
  const q = new URLSearchParams({ from, to })
  return request<CapacityResponse>(`/api/capacity?${q}`, { signal })
}
