package rooms

import (
	"testing"
	"time"
)

func TestWeekStart(t *testing.T) {
	tashkent, _ := time.LoadLocation("Asia/Tashkent") // UTC+5
	cases := []struct {
		name string
		now  time.Time
		want string
	}{
		{"wednesday", time.Date(2026, 11, 4, 15, 0, 0, 0, tashkent), "2026-11-02T00:00:00+05:00"},
		{"monday midnight", time.Date(2026, 11, 2, 0, 0, 0, 0, tashkent), "2026-11-02T00:00:00+05:00"},
		{"sunday night", time.Date(2026, 11, 8, 23, 59, 0, 0, tashkent), "2026-11-02T00:00:00+05:00"},
		// 20:00 UTC Sunday is already Monday 01:00 in Tashkent: a new week there.
		{"zone boundary", time.Date(2026, 11, 8, 20, 0, 0, 0, time.UTC), "2026-11-09T00:00:00+05:00"},
		{"across month", time.Date(2026, 12, 2, 9, 0, 0, 0, tashkent), "2026-11-30T00:00:00+05:00"},
	}
	for _, c := range cases {
		if got := WeekStart(c.now, tashkent).Format(time.RFC3339); got != c.want {
			t.Errorf("%s: %s, want %s", c.name, got, c.want)
		}
	}
}
