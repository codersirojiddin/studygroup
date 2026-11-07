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
	"github.com/study-online/backend/internal/rooms"
)

// MaxLength caps a single session, so a forgotten timer can't inflate stats.
const MaxLength = 12 * time.Hour

var (
	ErrAlreadyActive = errors.New("a study session is already running")
	ErrNoActive      = errors.New("no study session is running")
	ErrNotMember     = errors.New("not a member of this room")
	ErrNotFocusing   = errors.New("the room timer is not in a focus phase")
	ErrBadSource     = errors.New("invalid session source")
)

// How a session was started. Either way a user has at most one running
// session, so the two sources never count the same minutes twice.
const (
	SourceManual   = "manual"   // the user pressed Start
	SourcePomodoro = "pomodoro" // started by the room's Pomodoro during a focus phase
)

type Session struct {
	ID        string     `json:"id"`
	RoomID    *string    `json:"roomId"`
	RoomName  *string    `json:"roomName"`
	Topic     string     `json:"topic"`
	StartedAt time.Time  `json:"startedAt"`
	EndedAt   *time.Time `json:"endedAt"`
	Seconds   int64      `json:"seconds"` // elapsed so far for a running session
	Source    string     `json:"source"`
}

type Store struct{ db *pgxpool.Pool }

func NewStore(db *pgxpool.Pool) *Store { return &Store{db: db} }

// cappedEnd is the effective end of a session, used everywhere durations are
// computed: the real end, at most 12 hours in, and never past ends_at (the end
// of the focus phase for Pomodoro-driven sessions).
const cappedEnd = `least(coalesce(s.ended_at, now()), s.started_at + interval '12 hours', coalesce(s.ends_at, 'infinity'::timestamptz))`

const sessionSelect = `
	SELECT s.id::text, s.room_id::text, r.name, s.topic, s.started_at, s.ended_at,
	       extract(epoch FROM ` + cappedEnd + ` - s.started_at)::bigint, s.source
	FROM study_sessions s LEFT JOIN rooms r ON r.id = s.room_id`

func scanSession(row pgx.Row) (*Session, error) {
	s := &Session{}
	err := row.Scan(&s.ID, &s.RoomID, &s.RoomName, &s.Topic, &s.StartedAt, &s.EndedAt, &s.Seconds, &s.Source)
	return s, err
}

// pomodoroEnd returns when the room's current focus phase ends, or
// ErrNotFocusing when the timer is idle, paused or on a break.
func pomodoroEnd(ctx context.Context, tx pgx.Tx, roomID string) (time.Time, error) {
	t := rooms.DefaultTimer()
	var now time.Time
	err := tx.QueryRow(ctx, `
		SELECT focus_seconds, break_seconds, running, started_at, paused_ms, now()
		FROM room_timers WHERE room_id = $1`, roomID).
		Scan(&t.FocusSeconds, &t.BreakSeconds, &t.Running, &t.StartedAt, &t.PausedMs, &now)
	if errors.Is(err, pgx.ErrNoRows) {
		return time.Time{}, ErrNotFocusing
	}
	if err != nil {
		return time.Time{}, err
	}
	end, ok := t.FocusEnd(now)
	if !ok {
		return time.Time{}, ErrNotFocusing
	}
	return end, nil
}

// Start begins a session, optionally in a room the user belongs to.
//
// With source SourcePomodoro the room's timer must be in a focus phase; the
// session then stops counting when that phase ends. If the user already has a
// running session (manual, solo, or in another room) Start returns
// ErrAlreadyActive and nothing is added, which is how the Pomodoro and a
// manual session avoid counting the same time twice.
func (st *Store) Start(ctx context.Context, userID, roomID, topic, source string) (*Session, error) {
	if source == "" {
		source = SourceManual
	}
	if source != SourceManual && source != SourcePomodoro {
		return nil, ErrBadSource
	}
	if source == SourcePomodoro && roomID == "" {
		return nil, ErrBadSource
	}
	var out *Session
	err := pgx.BeginFunc(ctx, st.db, func(tx pgx.Tx) error {
		// A Pomodoro session past the end of its focus phase is finished even
		// if nobody stopped it; close it so it doesn't block a new session.
		if _, err := tx.Exec(ctx, `
			UPDATE study_sessions SET ended_at = ends_at
			WHERE user_id = $1 AND ended_at IS NULL AND ends_at IS NOT NULL AND ends_at <= now()`, userID); err != nil {
			return err
		}

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

		var endsAt *time.Time
		if source == SourcePomodoro {
			end, err := pomodoroEnd(ctx, tx, roomID)
			if err != nil {
				return err
			}
			endsAt = &end
		}

		var id string
		err := tx.QueryRow(ctx, `
			INSERT INTO study_sessions (user_id, room_id, topic, source, ends_at) VALUES ($1, $2, $3, $4, $5)
			RETURNING id::text`, userID, room, topic, source, endsAt).Scan(&id)
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

// Stop ends the running session. A non-empty source stops it only if it was
// started that way, so an automatic stop never ends a session the user started
// by hand.
func (st *Store) Stop(ctx context.Context, userID, source string) (*Session, error) {
	var id string
	err := st.db.QueryRow(ctx, `
		UPDATE study_sessions
		SET ended_at = least(now(), started_at + interval '12 hours', coalesce(ends_at, 'infinity'::timestamptz))
		WHERE user_id = $1 AND ended_at IS NULL AND ($2::text = '' OR source = $2::text)
		RETURNING id::text`, userID, source).Scan(&id)
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
		WHERE s.user_id = $1 AND s.ended_at IS NULL AND s.started_at > now() - interval '12 hours'
		  AND (s.ends_at IS NULL OR s.ends_at > now())`, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

// EndPomodoro ends every running Pomodoro-driven session in a room (the timer
// was paused, skipped, reset or restarted) and returns the affected user ids.
func (st *Store) EndPomodoro(ctx context.Context, roomID string) ([]string, error) {
	rows, err := st.db.Query(ctx, `
		UPDATE study_sessions SET ended_at = least(now(), ends_at)
		WHERE room_id = $1 AND source = 'pomodoro' AND ended_at IS NULL
		RETURNING user_id::text`, roomID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// EndPomodoroFor ends one user's Pomodoro-driven session in a room, because
// they left it (closed the tab, went to another page, lost connection).
func (st *Store) EndPomodoroFor(ctx context.Context, userID, roomID string) error {
	_, err := st.db.Exec(ctx, `
		UPDATE study_sessions SET ended_at = least(now(), ends_at)
		WHERE user_id = $1 AND room_id = $2 AND source = 'pomodoro' AND ended_at IS NULL`, userID, roomID)
	return err
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
