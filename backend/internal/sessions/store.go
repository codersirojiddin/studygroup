// Package sessions records study sessions and computes per-user statistics.
package sessions

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/study-online/backend/internal/realtime"
)

// MaxLength caps a single session, so a forgotten timer can't inflate stats.
const MaxLength = 12 * time.Hour

var (
	ErrAlreadyActive = errors.New("a study session is already running")
	ErrNoActive      = errors.New("no study session is running")
	ErrNotMember     = errors.New("not a member of this room")
)

type Session struct {
	ID        string     `json:"id"`
	RoomID    *string    `json:"roomId"`
	RoomName  *string    `json:"roomName"`
	Topic     string     `json:"topic"`
	StartedAt time.Time  `json:"startedAt"`
	EndedAt   *time.Time `json:"endedAt"`
	Seconds   int64      `json:"seconds"` // elapsed so far for a running session
}

type Store struct{ db *pgxpool.Pool }

func NewStore(db *pgxpool.Pool) *Store { return &Store{db: db} }

// cappedEnd is the effective end of a session, used everywhere durations are computed.
const cappedEnd = `least(coalesce(s.ended_at, now()), s.started_at + interval '12 hours')`

const sessionSelect = `
	SELECT s.id::text, s.room_id::text, r.name, s.topic, s.started_at, s.ended_at,
	       extract(epoch FROM ` + cappedEnd + ` - s.started_at)::bigint
	FROM study_sessions s LEFT JOIN rooms r ON r.id = s.room_id`

func scanSession(row pgx.Row) (*Session, error) {
	s := &Session{}
	err := row.Scan(&s.ID, &s.RoomID, &s.RoomName, &s.Topic, &s.StartedAt, &s.EndedAt, &s.Seconds)
	return s, err
}

// Start begins a session, optionally in a room the user belongs to.
func (st *Store) Start(ctx context.Context, userID, roomID, topic string) (*Session, error) {
	var out *Session
	err := pgx.BeginFunc(ctx, st.db, func(tx pgx.Tx) error {
		// Close a forgotten session at its cap so it doesn't block a new one.
		if _, err := tx.Exec(ctx, `
			UPDATE study_sessions SET ended_at = started_at + interval '12 hours'
			WHERE user_id = $1 AND ended_at IS NULL AND started_at < now() - interval '12 hours'`, userID); err != nil {
			return err
		}

		var room *string
		if roomID != "" {
			var member bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2)`,
				roomID, userID).Scan(&member); err != nil {
				return err
			}
			if !member {
				return ErrNotMember
			}
			room = &roomID
		}

		var id string
		err := tx.QueryRow(ctx, `INSERT INTO study_sessions (user_id, room_id, topic) VALUES ($1, $2, $3) RETURNING id::text`,
			userID, room, topic).Scan(&id)
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrAlreadyActive
		}
		if err != nil {
			return err
		}
		out, err = scanSession(tx.QueryRow(ctx, sessionSelect+` WHERE s.id = $1`, id))
		return err
	})
	return out, err
}

// Stop ends the running session.
func (st *Store) Stop(ctx context.Context, userID string) (*Session, error) {
	var id string
	err := st.db.QueryRow(ctx, `
		UPDATE study_sessions SET ended_at = least(now(), started_at + interval '12 hours')
		WHERE user_id = $1 AND ended_at IS NULL RETURNING id::text`, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNoActive
	}
	if err != nil {
		return nil, err
	}
	return scanSession(st.db.QueryRow(ctx, sessionSelect+` WHERE s.id = $1`, id))
}

// Active returns the running session, or nil. Sessions past the cap count as finished.
func (st *Store) Active(ctx context.Context, userID string) (*Session, error) {
	s, err := scanSession(st.db.QueryRow(ctx, sessionSelect+`
		WHERE s.user_id = $1 AND s.ended_at IS NULL AND s.started_at > now() - interval '12 hours'`, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

// ActiveStatus adapts Active for the realtime hub.
func (st *Store) ActiveStatus(ctx context.Context, userID string) (*realtime.Status, error) {
	s, err := st.Active(ctx, userID)
	if err != nil || s == nil {
		return nil, err
	}
	return ToStatus(s), nil
}

func ToStatus(s *Session) *realtime.Status {
	room := ""
	if s.RoomID != nil {
		room = *s.RoomID
	}
	return &realtime.Status{RoomID: room, Since: s.StartedAt, Topic: s.Topic}
}

// Recent returns the user's latest sessions.
func (st *Store) Recent(ctx context.Context, userID string, limit int) ([]Session, error) {
	rows, err := st.db.Query(ctx, sessionSelect+` WHERE s.user_id = $1 ORDER BY s.started_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Session, error) {
		s, err := scanSession(row)
		return *s, err
	})
}

type Day struct {
	Date    string `json:"date"` // YYYY-MM-DD in the requested time zone
	Seconds int64  `json:"seconds"`
}

type Stats struct {
	TodaySeconds int64 `json:"todaySeconds"`
	WeekSeconds  int64 `json:"weekSeconds"`
	TotalSeconds int64 `json:"totalSeconds"`
	SessionCount int64 `json:"sessionCount"`
	StreakDays   int   `json:"streakDays"` // consecutive days with study, ending today or yesterday
	Last7Days    []Day `json:"last7Days"`  // oldest first, today last
}

// Stats sums study time in the user's time zone. Sessions count toward the day they started.
func (st *Store) Stats(ctx context.Context, userID string, loc *time.Location, now time.Time) (*Stats, error) {
	out := &Stats{}
	if err := st.db.QueryRow(ctx, `
		SELECT coalesce(sum(extract(epoch FROM `+cappedEnd+` - s.started_at)), 0)::bigint, count(*)
		FROM study_sessions s WHERE s.user_id = $1`, userID).Scan(&out.TotalSeconds, &out.SessionCount); err != nil {
		return nil, err
	}

	tz := loc.String()
	rows, err := st.db.Query(ctx, `
		SELECT to_char((s.started_at AT TIME ZONE $2)::date, 'YYYY-MM-DD'),
		       sum(extract(epoch FROM `+cappedEnd+` - s.started_at))::bigint
		FROM study_sessions s
		WHERE s.user_id = $1
		GROUP BY 1 ORDER BY 1 DESC LIMIT 400`, userID, tz)
	if err != nil {
		return nil, err
	}
	byDay := map[string]int64{}
	var studied []string // descending dates
	for rows.Next() {
		var d string
		var secs int64
		if err := rows.Scan(&d, &secs); err != nil {
			rows.Close()
			return nil, err
		}
		byDay[d] = secs
		studied = append(studied, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	today := now.In(loc)
	for i := 6; i >= 0; i-- {
		d := today.AddDate(0, 0, -i).Format(time.DateOnly)
		out.Last7Days = append(out.Last7Days, Day{Date: d, Seconds: byDay[d]})
		out.WeekSeconds += byDay[d]
	}
	out.TodaySeconds = byDay[today.Format(time.DateOnly)]
	out.StreakDays = streak(studied, today)
	return out, nil
}

// streak counts consecutive study days in desc (YYYY-MM-DD, descending),
// allowing the run to end yesterday so it isn't lost before today's session.
func streak(desc []string, today time.Time) int {
	if len(desc) == 0 {
		return 0
	}
	day := today
	if desc[0] != day.Format(time.DateOnly) {
		day = day.AddDate(0, 0, -1)
	}
	n := 0
	for _, d := range desc {
		if d != day.Format(time.DateOnly) {
			break
		}
		n++
		day = day.AddDate(0, 0, -1)
	}
	return n
}
