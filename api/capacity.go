package main

import (
	"context"
	"net/http"
	"strconv"
	"time"
)

const (
	defaultPageSize = 100
	maxPageSize     = 500
)

// capacityCell is one person-week: hours assigned against hours available.
type capacityCell struct {
	Allocated float64 `json:"allocated"`
	Capacity  float64 `json:"capacity"`
}

// capacityRow is one person across every week in the range. Cells are
// positional and line up with capacityResponse.Weeks.
type capacityRow struct {
	ID          int            `json:"id"`
	Name        string         `json:"name"`
	WeeklyHours float64        `json:"weeklyHours"`
	Cells       []capacityCell `json:"cells"`
}

// capacityResponse is the grid's data: the weeks actually served (snapped
// to whole weeks, which may be wider than asked), one row per person on
// this page, and the cursor for the next page of people, if any.
type capacityResponse struct {
	From       string        `json:"from"`
	To         string        `json:"to"`
	Weeks      []string      `json:"weeks"`
	People     []capacityRow `json:"people"`
	NextCursor *int          `json:"nextCursor"`
}

// handleCapacity serves GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD[&limit=&cursor=]
//
// Pages through people in name order; cursor is the id of the last person
// on the previous page. Hours are counted on weekdays only.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	rng, err := parseWeekRange(q.Get("from"), q.Get("to"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	limit, err := parseLimit(q.Get("limit"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var cursor *int
	if c := q.Get("cursor"); c != "" {
		id, err := strconv.Atoi(c)
		if err != nil || id < 1 {
			http.Error(w, "cursor: expected a person id", http.StatusBadRequest)
			return
		}
		cursor = &id
	}

	resp, err := s.loadCapacity(r.Context(), rng, limit, cursor)
	if err != nil {
		http.Error(w, "capacity query failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func parseLimit(raw string) (int, error) {
	if raw == "" {
		return defaultPageSize, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 || n > maxPageSize {
		return 0, &limitError{}
	}
	return n, nil
}

type limitError struct{}

func (*limitError) Error() string {
	return "limit: expected 1.." + strconv.Itoa(maxPageSize)
}

// loadCapacity runs two scoped queries: the page of people, then the
// weekday hours of their assignments bucketed by ISO week. The dense
// matrix is assembled here so people with no assignments still get a row.
func (s *server) loadCapacity(ctx context.Context, rng weekRange, limit int, cursor *int) (*capacityResponse, error) {
	// One extra row tells us whether a next page exists.
	rows, err := s.db.Query(ctx, `
		SELECT id, name, weekly_hours::float8
		FROM people
		WHERE $1::int IS NULL
		   OR (name, id) > ((SELECT name FROM people WHERE id = $1), $1)
		ORDER BY name, id
		LIMIT $2`, cursor, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	weeks := rng.WeekStarts()
	people := make([]capacityRow, 0, limit)
	index := map[int]int{} // person id -> row position
	for rows.Next() {
		var p capacityRow
		if err := rows.Scan(&p.ID, &p.Name, &p.WeeklyHours); err != nil {
			return nil, err
		}
		p.Cells = make([]capacityCell, len(weeks))
		for i := range p.Cells {
			p.Cells[i].Capacity = p.WeeklyHours
		}
		index[p.ID] = len(people)
		people = append(people, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var next *int
	if len(people) > limit {
		people = people[:limit]
		last := people[limit-1].ID
		next = &last
	}

	ids := make([]int, 0, len(people))
	for _, p := range people {
		ids = append(ids, p.ID)
	}

	// Every weekday in the range, joined to the assignments covering it.
	// date_trunc('week') is ISO: it returns the Monday.
	alloc, err := s.db.Query(ctx, `
		WITH days AS (
			SELECT d::date AS day, date_trunc('week', d)::date AS week
			FROM generate_series($1::date, $2::date, interval '1 day') AS d
			WHERE extract(isodow FROM d) <= 5
		)
		SELECT a.person_id, days.week, sum(a.hours_per_day)::float8
		FROM assignments a
		JOIN days ON days.day BETWEEN a.start_date AND a.end_date
		WHERE a.person_id = ANY($3)
		  AND a.start_date <= $2 AND a.end_date >= $1
		GROUP BY a.person_id, days.week`,
		rng.From, rng.To, ids)
	if err != nil {
		return nil, err
	}
	defer alloc.Close()

	weekIndex := map[time.Time]int{}
	for i, w := range weeks {
		weekIndex[w] = i
	}
	for alloc.Next() {
		var personID int
		var week time.Time
		var hours float64
		if err := alloc.Scan(&personID, &week, &hours); err != nil {
			return nil, err
		}
		if wi, ok := weekIndex[week]; ok {
			people[index[personID]].Cells[wi].Allocated = hours
		}
	}
	if err := alloc.Err(); err != nil {
		return nil, err
	}

	resp := &capacityResponse{
		From:       rng.From.Format("2006-01-02"),
		To:         rng.To.Format("2006-01-02"),
		Weeks:      make([]string, len(weeks)),
		People:     people,
		NextCursor: next,
	}
	for i, w := range weeks {
		resp.Weeks[i] = w.Format("2006-01-02")
	}
	return resp, nil
}
