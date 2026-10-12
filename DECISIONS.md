# Decisions

## What did the spec not tell you?
- Which days count: The schema didn't have any definition of working days and assignments span weekends, so I decided on weekday-only hours for this, even though it's not everywhere that it works like this. It was decided based on the seed data, that didn't contain weekends, but acknowledged that this is not the rule per se. My agent filed it down as assumption but in a real scenario I'd clarify this business rule beforehand;
- What a "week" is and what to do with a partial one. So I went with ISO Mon–Sun, the API snaps from/to outward to whole weeks and echoes the range it served. The base code default also finished on Friday so I was comfortable going for it.
- The JSON shape: Dense positional rows (weeks[] + people[].cells[] with {allocated, capacity}), capacity repeated per cell even though it equals weeklyHours today. This was decided because the contract survives per-week capacity (holidays, leave) without a client change
- How the screen gets correct after a save: I decided to patch the one row from the PATCH response (which returns the stored person) and drop every other cached range. No refetch, no optimistic write. And I went with that because changing capacity changes capacity only, allocation never moves, so the response already carries every number the row needs; a refetch is correct but wasteful at thousands of rows; optimistic buys nothing on a one-row round trip and complicates the failure path.
- What a failed save looks like: I decided to make the typed value stay in the input beside the error with retry; the cell keeps the last server-confirmed number; editor locked while in flight so Enter/Retry cannot fire twice; blur cancels, never saves; unchanged value sends nothing. Server side the PATCH is an absolute value, so a duplicate is harmless.
- Row order with 160 non-ASCII names: Sorted by name with the cursor compared under the same collation as ORDER BY, so pages never overlap or skip; verified the DB collates by codepoint (en_US.utf8 on musl), so CJK/RTL names sort last but never break.
- Concurrency: Last-write-wins, consciously. Next step is compare-and-set (expectedWeeklyHours → 409 with the current value); no schema change, not in the brief.
- Percentages: Eli Nakamura, for example, has 0 weekly hours and 20 allocated. An utilisation % divides by zero. So I went with the logic that Over = allocated > capacity, shown with colour plus a text marker.

## What did you notice that looked wrong?
- Seed rows are duplicated ~15× with fractional hours_per_day; 
- Weekend hours. 46.7k assignments end on Sat/Sun and 20% of raw hours fall on weekends, though none starts or lives entirely on one. Treated as an artifact of random date spans, not work.
- Eli Nakamura: 0 weekly hours, 20 allocated. Left in the data (fixed input), rendered as over; it is the case that killed percentages.
- Index (start_date, end_date) is weak for this query (start_date <= day qualifies half the table). (person_id, start_date) would serve it; schema is fixed, so measured and written down: 134 ms for 500 people × 26 weeks, 9.5 ms for the default page.
- After the first grid, the status line said "N over-allocated in this range" while only the first 100 of 500 people were loaded (9 vs 41 for the whole roster). Fixed: Load more by cursor, label says "loaded".

## What did the AI get wrong that you caught?
- A code issue where first grid showed 100 of 500 people and counted over-allocation as if it were the whole range.
- "This week" used the UTC day on a local clock. Monday 01:30 in Tallinn fell into the previous week. Agent fixed with a local-calendar-day helper and a test.
- Stale closure in the cache re-seed after a save. If the range changed while a PATCH was in flight, one range's rows were filed under another's key.

## What would you do differently with a week?

- Filter "only over-allocated", sort by worst week first, team totals row. The direct answer to "see who is over-committed before the week starts"; today the manager scans.
- Working calendar: holidays, per-person schedules, part-time days. Capacity per week then really varies, which is why capacity is already per cell in the contract
- Query and index: (person_id, start_date) plus the arithmetic weekday-overlap formula (~10× fewer joined rows before aggregation).
- Virtualised rows instead of Load more once rosters reach thousands; the API already pages.
- Tests I would add first: query test against the seeded DB, PATCH validation table test, grid test for Load more and for the range-changed-mid-save path.
- Structured logs with a request id in the API; handlers log plain text today.
- Cache key by snapped range; Retry after a failed Load more keeps the loaded pages.
- Range shared with the timeline panel through the URL, which is why it is already there.
