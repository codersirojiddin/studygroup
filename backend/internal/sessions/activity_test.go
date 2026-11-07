package sessions

import "testing"

func TestLongestStreak(t *testing.T) {
	cases := []struct {
		name string
		desc []string
		want int
	}{
		{"empty", nil, 0},
		{"single", []string{"2026-11-06"}, 1},
		{"run of three", []string{"2026-11-06", "2026-11-05", "2026-11-04"}, 3},
		{"older run is longer", []string{"2026-11-06", "2026-11-05", "2026-10-20", "2026-10-19", "2026-10-18", "2026-10-17"}, 4},
		{"across month and year", []string{"2026-01-02", "2026-01-01", "2025-12-31", "2025-12-30"}, 4},
		{"gaps only", []string{"2026-11-06", "2026-11-04", "2026-11-02"}, 1},
	}
	for _, c := range cases {
		if got := longestStreak(c.desc); got != c.want {
			t.Errorf("%s: longestStreak = %d, want %d", c.name, got, c.want)
		}
	}
}
