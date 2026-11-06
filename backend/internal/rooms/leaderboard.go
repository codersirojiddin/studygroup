package rooms

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/study-online/backend/internal/httpx"
)

type LeaderboardEntry struct {
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName"`
	Seconds     int64  `json:"seconds"`
}

// WeekStart returns Monday 00:00 of the week containing now, in loc.
func WeekStart(now time.Time, loc *time.Location) time.Time {
	t := now.In(loc)
	daysSinceMonday := (int(t.Weekday()) + 6) % 7
	y, m, d := t.Date()
	return time.Date(y, m, d-daysSinceMonday, 0, 0, 0, 0, loc)
}

// Leaderboard ranks every member by time studied in this room since `since`.
// Running sessions count up to now; sessions are capped at 12 hours like everywhere else.
func (s *Store) Leaderboard(ctx context.Context, roomID string, since time.Time) ([]LeaderboardEntry, error) {
	rows, err := s.db.Query(ctx, `
		SELECT u.id::text, u.display_name,
		       coalesce(sum(extract(epoch FROM
		           least(coalesce(ss.ended_at, now()), ss.started_at + interval '12 hours') - ss.started_at)), 0)::bigint AS secs
		FROM room_members m
		JOIN users u ON u.id = m.user_id
		LEFT JOIN study_sessions ss ON ss.user_id = m.user_id AND ss.room_id = m.room_id AND ss.started_at >= $2
		WHERE m.room_id = $1
		GROUP BY u.id, u.display_name
		ORDER BY secs DESC, u.display_name`, roomID, since)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (LeaderboardEntry, error) {
		var e LeaderboardEntry
		err := row.Scan(&e.UserID, &e.DisplayName, &e.Seconds)
		return e, err
	})
}

// Leaderboard handles GET /api/rooms/{id}/leaderboard?tz=Area/City (members only).
func (h *Handlers) Leaderboard(w http.ResponseWriter, r *http.Request) {
	id, ok := httpx.PathUUID(w, r, "id")
	if !ok {
		return
	}
	loc, ok := httpx.TimeZone(w, r)
	if !ok {
		return
	}
	if _, ok := h.requireRole(w, r, id, func(string) bool { return true }); !ok {
		return
	}
	since := WeekStart(time.Now(), loc)
	entries, err := h.Store.Leaderboard(r.Context(), id, since)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"weekStart": since, "entries": entries})
}
