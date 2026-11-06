package sessions

import (
	"testing"
	"time"
)

func TestStreak(t *testing.T) {
	today := time.Date(2026, 11, 4, 15, 0, 0, 0, time.UTC)
	cases := []struct {
		name string
		days []string
		want int
	}{
		{"none", nil, 0},
		{"today only", []string{"2026-11-04"}, 1},
		{"ends yesterday", []string{"2026-11-03", "2026-11-02"}, 2},
		{"gap breaks it", []string{"2026-11-04", "2026-11-03", "2026-11-01"}, 2},
		{"stale", []string{"2026-11-01"}, 0},
		{"across month", []string{"2026-11-04", "2026-11-03", "2026-11-02", "2026-11-01", "2026-10-31"}, 5},
	}
	for _, c := range cases {
		if got := streak(c.days, today); got != c.want {
			t.Errorf("%s: streak = %d, want %d", c.name, got, c.want)
		}
	}
}
