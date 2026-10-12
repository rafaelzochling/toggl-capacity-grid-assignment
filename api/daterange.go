package main

import (
	"errors"
	"fmt"
	"time"
)

// maxWeeks bounds a single capacity request. Two years of history for a
// few thousand people does not fit in one response; the client pages by
// range and by person instead.
const maxWeeks = 26

// weekRange is a from/to pair snapped outward to whole ISO weeks
// (Monday through Sunday). The grid's unit is a week, so a partial week
// at either edge would show a number nobody can read.
type weekRange struct {
	From time.Time // a Monday
	To   time.Time // a Sunday
}

// parseWeekRange reads YYYY-MM-DD strings and widens them to full weeks.
func parseWeekRange(from, to string) (weekRange, error) {
	f, err := time.Parse("2006-01-02", from)
	if err != nil {
		return weekRange{}, fmt.Errorf("from: expected YYYY-MM-DD")
	}
	t, err := time.Parse("2006-01-02", to)
	if err != nil {
		return weekRange{}, fmt.Errorf("to: expected YYYY-MM-DD")
	}
	if t.Before(f) {
		return weekRange{}, errors.New("to must not be before from")
	}
	r := weekRange{From: startOfWeek(f), To: startOfWeek(t).AddDate(0, 0, 6)}
	if r.Weeks() > maxWeeks {
		return weekRange{}, fmt.Errorf("range covers %d weeks, maximum is %d", r.Weeks(), maxWeeks)
	}
	return r, nil
}

// startOfWeek returns the Monday on or before d.
func startOfWeek(d time.Time) time.Time {
	offset := (int(d.Weekday()) + 6) % 7 // Monday=0 ... Sunday=6
	return d.AddDate(0, 0, -offset)
}

// Weeks is how many whole weeks the range spans.
func (r weekRange) Weeks() int {
	return int(r.To.Sub(r.From).Hours()/24+1) / 7
}

// WeekStarts lists the Monday of every week in the range, in order.
func (r weekRange) WeekStarts() []time.Time {
	out := make([]time.Time, 0, r.Weeks())
	for w := r.From; !w.After(r.To); w = w.AddDate(0, 0, 7) {
		out = append(out, w)
	}
	return out
}
