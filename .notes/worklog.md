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
