# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

## 2026-10-12 — sweep and API

- Diffed the seed snapshot against the original hand-written seed (git history). Every original assignment is now ~15 identical rows with fractional hours_per_day; summing reproduces the original 2/4/6/8 h/day. So: sum everything, never dedupe.
- Weekday-only counting is the intended model: 2040 person-weeks land exactly at capacity vs 445 with 7-day counting, and Ana Ferreira's first week is exactly 40. Assumption written down: weekends are non-working; holidays and per-person calendars are out of scope.
- Range is snapped outward to whole ISO weeks (Mon–Sun). A partial-week total is a number a manager cannot read. The API echoes the range it actually served.
- 26-week cap and keyset pagination by (name, id) on the capacity endpoint. Production is thousands of people × two years; one request must stay bounded. The grid only loads the first page for now; paging UI is deferred.
- Two scoped queries instead of one: a page of people, then weekday hours for those ids. Keeps people with no assignments in the grid and keeps the SQL readable. generate_series over days joined on BETWEEN is the "sound, not clever" version; an arithmetic weekday-overlap formula is the optimisation if the day join ever shows up in EXPLAIN.
- Collation checked: the DB is en_US.utf8 on musl, which sorts by codepoint. Non-Latin names sort after Latin ones but the cursor compares with the same collation as ORDER BY, so pages never overlap or skip. ICU collations exist in the image if locale-aware order is wanted.
- Go test added for the week snapping even though the brief only mentions Vitest; it is the piece I would be nervous to change.

## 2026-10-12 — grid

- Kept the scaffold's default range rather than anchoring on today: it holds the seed's curated cases (full week, weekend split, over-allocation, zero capacity) and the reviewer is told to look at the numbers. "This week" is one click and the range is in the URL.
- Range state lives in App and mirrors to the URL with replaceState; the brief says this grid becomes one panel of a team-overview page, so the range is page state a sibling timeline will share.
- Last good table stays on screen, dimmed, while a new range loads or fails. A request counter drops out-of-order responses; range changes abort the in-flight request. Seen ranges are cached for the session.
- No utilisation percentage anywhere: Eli Nakamura has 0 weekly hours and 20 allocated, and a percentage would divide by zero. Over-allocation is `allocated > capacity`, shown with colour and a text marker.

## 2026-10-12 — editing

- After a save the grid patches the row from the PATCH response and drops every other cached range. Reasoning: changing capacity changes capacity only; allocation never moves, so the response carries every number the row needs. A refetch would be correct but wasteful at thousands of rows; an optimistic write buys nothing for a one-row round trip and complicates the failure path.
- Failed save: the typed value stays in the input beside the error with a Retry button, and the cell keeps the last server-confirmed number. The editor locks while a request is in flight so Enter or Retry cannot fire twice; the server is idempotent (absolute value) as a backstop.
- Blur cancels rather than saves, so a mis-click never writes. Unchanged value sends nothing.
- Concurrency left as last-write-wins. Next step would be compare-and-set: `expectedWeeklyHours` in the body, 409 with the current value, UI shows "changed elsewhere to X". Needs no schema change. Not in the brief, so not built.
- Tests: failed save keeps the draft and the retry applies the server answer; a late response for a range the user already left is ignored. Those are the two behaviours I would be nervous to change.

## 2026-10-12 — adversarial review before merge

- Ran a second agent over the branches as a hostile reviewer. It verified the SQL against an independent arithmetic overlap query (26 weeks × 500 people, zero diff), walked pagination with two page sizes (500 distinct, no gaps) and timed the allocation query at 134 ms for the full roster over 26 weeks.
- It found four real defects, all fixed in this branch: only the first 100 people were shown and the summary claimed to count the whole range (now "Load more" by cursor, count labelled as loaded); an unknown cursor returned an empty 200 page (now 404); "This week" used UTC day on a local clock (Monday 01:30 in Tallinn landed on the previous week); the picker allowed ranges the API rejects and Retry looped on the 400 (now capped in the UI, no Retry on 4xx, grid dims on error).
- It also caught a stale-closure bug in my cache re-seeding after a save: if the range changed while the PATCH was in flight, one range's rows were filed under another's key. Fixed by clearing the cache instead of re-seeding.
- Deferred from its performance notes: the `(start_date, end_date)` index is weak for `start_date <= day` (half the table qualifies); `(person_id, start_date)` would serve this query better, and the arithmetic weekday-overlap form would cut the day-join row count ~10×. Schema is fixed for this exercise, so written down, not done.

## 2026-10-12 — wrap-up (01:58, inside the budget)

- Extra, not asked for: a Toggl Track-flavoured stylesheet (PR #7). CSS only, no logic touched; tokens on :root with a dark-scheme override. Kept because it cost minutes and makes the over/full/empty states read better, dropped from the "core" story on purpose.
- Verified on main before stopping: `.notes/smoke.sh` ALL OK, Vitest 7/7, tsc clean, go vet + go test clean, and the grid opened in a browser for the default range, an edit, a failed save with the API stopped, a retry, week navigation and Load more.
- Deferred, in the order I would pick them up:
  1. Compare-and-set on PATCH (`expectedWeeklyHours`, 409 with the current value) so two managers editing the same person see it. No schema change.
  2. A working calendar: holidays and per-person schedules. Weekends-only is an assumption today.
  3. Index `(person_id, start_date)` and the arithmetic weekday-overlap query (~10× fewer joined rows). Schema is fixed in this exercise.
  4. "Only over-allocated" filter and worst-week-first sort: the direct answer to "see who is over-committed before the week starts".
  5. Virtualised rows instead of Load more once rosters reach thousands; the API already pages.
  6. More tests: the SQL against the seeded DB, a PATCH validation table, Load more in the grid.
  7. Structured request logging with a request id in the Go handlers.
