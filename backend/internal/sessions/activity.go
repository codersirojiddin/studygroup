package sessions

import (
	"context"
	"time"
)

// ActivityDays is how many days the profile heatmap covers.
const ActivityDays = 365

// Activity is the study history shown on a public profile.
type Activity struct {
	// Days lists days with study time inside the heatmap window, oldest first.
	// Days without study are omitted; the client fills the empty cells.
	Days          []Day `json:"days"`
	ActiveDays    int   `json:"activeDays"` // days with study inside the window
	TotalSeconds  int64 `json:"totalSeconds"`
	SessionCount  int64 `json:"sessionCount"`
	StreakDays    int   `json:"streakDays"`
	LongestStreak int   `json:"longestStreakDays"`
}

// Activity sums a user's study time per day in loc (sessions count toward the
// day they started, like Stats). History older than ten years is ignored.
func (st *Store) Activity(ctx context.Context, userID string, loc *time.Location, now time.Time) (*Activity, error) {
	rows, err := st.db.Query(ctx, `
		SELECT to_char((s.started_at AT TIME ZONE $2)::date, 'YYYY-MM-DD'),
		       sum(extract(epoch FROM `+cappedEnd+` - s.started_at))::bigint,
		       count(*)
		FROM study_sessions s
		WHERE s.user_id = $1
		GROUP BY 1 ORDER BY 1 DESC LIMIT 3650`, userID, loc.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	today := now.In(loc)
	cutoff := today.AddDate(0, 0, -(ActivityDays - 1)).Format(time.DateOnly)

	out := &Activity{Days: []Day{}}
	var studied []string // descending dates
	for rows.Next() {
		var d string
		var secs, n int64
		if err := rows.Scan(&d, &secs, &n); err != nil {
			return nil, err
		}
		studied = append(studied, d)
		out.TotalSeconds += secs
		out.SessionCount += n
		if d >= cutoff { // YYYY-MM-DD sorts like dates
			out.Days = append(out.Days, Day{Date: d, Seconds: secs})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Rows came newest first; the API promises oldest first.
	for i, j := 0, len(out.Days)-1; i < j; i, j = i+1, j-1 {
		out.Days[i], out.Days[j] = out.Days[j], out.Days[i]
	}
	out.ActiveDays = len(out.Days)
	out.StreakDays = streak(studied, today)
	out.LongestStreak = longestStreak(studied)
	return out, nil
}

// longestStreak returns the longest run of consecutive days in desc
// (YYYY-MM-DD, descending, no duplicates).
func longestStreak(desc []string) int {
	best, run := 0, 0
	var prev time.Time
	for _, d := range desc {
		t, err := time.Parse(time.DateOnly, d)
		if err != nil {
			continue
		}
		if run > 0 && prev.AddDate(0, 0, -1).Equal(t) {
			run++
		} else {
			run = 1
		}
		prev = t
		best = max(best, run)
	}
	return best
}
