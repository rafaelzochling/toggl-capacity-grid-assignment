package main

import "testing"

func TestParseWeekRangeSnapsToWholeWeeks(t *testing.T) {
	// The scaffold default: Monday to a Friday, mid-week end.
	r, err := parseWeekRange("2025-12-29", "2026-01-16")
	if err != nil {
		t.Fatal(err)
	}
	if got := r.From.Format("2006-01-02"); got != "2025-12-29" {
		t.Errorf("from = %s, want 2025-12-29", got)
	}
	if got := r.To.Format("2006-01-02"); got != "2026-01-18" {
		t.Errorf("to = %s, want 2026-01-18 (Sunday)", got)
	}
	if r.Weeks() != 3 {
		t.Errorf("weeks = %d, want 3", r.Weeks())
	}

	// A Sunday 'from' belongs to the week that started six days earlier.
	r, err = parseWeekRange("2026-01-04", "2026-01-04")
	if err != nil {
		t.Fatal(err)
	}
	if got := r.From.Format("2006-01-02"); got != "2025-12-29" {
		t.Errorf("sunday from = %s, want 2025-12-29", got)
	}
	if r.Weeks() != 1 {
		t.Errorf("weeks = %d, want 1", r.Weeks())
	}
}

func TestParseWeekRangeRejectsBadInput(t *testing.T) {
	cases := [][2]string{
		{"2026-01-10", "2026-01-01"}, // reversed
		{"not-a-date", "2026-01-01"},
		{"2026-01-01", "2026-12-31"}, // 53 weeks, over the cap
	}
	for _, c := range cases {
		if _, err := parseWeekRange(c[0], c[1]); err == nil {
			t.Errorf("parseWeekRange(%q, %q) accepted, want error", c[0], c[1])
		}
	}
}
