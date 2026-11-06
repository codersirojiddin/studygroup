package rooms

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Timer is a room's shared Pomodoro state. Clients derive the current phase
// and time left from StartedAt (or PausedMs) and the two durations.
type Timer struct {
	FocusSeconds int        `json:"focusSeconds"`
	BreakSeconds int        `json:"breakSeconds"`
	Running      bool       `json:"running"`
	StartedAt    *time.Time `json:"startedAt"` // set while running
	PausedMs     int64      `json:"pausedMs"`  // elapsed ms while paused; 0 when idle
	UpdatedBy    *string    `json:"updatedBy"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

// DefaultTimer is the state of a room that has never used its timer.
func DefaultTimer() Timer {
	return Timer{FocusSeconds: 25 * 60, BreakSeconds: 5 * 60}
}

var (
	ErrBadTimerAction = errors.New("invalid timer action for the current state")
	ErrBadDuration    = errors.New("focus must be 1-180 minutes and break 1-60 minutes")
)

// TimerAction is a control request. Durations apply to "start" only.
type TimerAction struct {
	Action       string
	FocusSeconds int
	BreakSeconds int
}

// elapsed returns how far into the cycle sequence the timer is.
func (t Timer) elapsed(now time.Time) time.Duration {
	if t.Running && t.StartedAt != nil {
		return now.Sub(*t.StartedAt)
	}
	return time.Duration(t.PausedMs) * time.Millisecond
}

// Phase reports the current phase ("idle", "focus" or "break") and time left in it.
func (t Timer) Phase(now time.Time) (string, time.Duration) {
	if !t.Running && t.PausedMs == 0 {
		return "idle", time.Duration(t.FocusSeconds) * time.Second
	}
	focus := time.Duration(t.FocusSeconds) * time.Second
	cycle := focus + time.Duration(t.BreakSeconds)*time.Second
	pos := t.elapsed(now) % cycle
	if pos < focus {
		return "focus", focus - pos
	}
	return "break", cycle - pos
}

// Apply returns the timer after an action at time now.
//
//	start  begin a new focus phase (from any state) with the given durations
//	pause  freeze a running timer
//	resume continue a paused timer
//	skip   jump to the start of the next phase
//	reset  back to idle, keeping the durations
func (t Timer) Apply(a TimerAction, now time.Time) (Timer, error) {
	paused := !t.Running && t.PausedMs > 0
	switch a.Action {
	case "start":
		if a.FocusSeconds < 60 || a.FocusSeconds > 10800 || a.BreakSeconds < 60 || a.BreakSeconds > 3600 {
			return t, ErrBadDuration
		}
		t.FocusSeconds, t.BreakSeconds = a.FocusSeconds, a.BreakSeconds
		t.Running, t.StartedAt, t.PausedMs = true, &now, 0
	case "pause":
		if !t.Running {
			return t, ErrBadTimerAction
		}
		t.PausedMs = max(1, t.elapsed(now).Milliseconds())
		t.Running, t.StartedAt = false, nil
	case "resume":
		if !paused {
			return t, ErrBadTimerAction
		}
		start := now.Add(-time.Duration(t.PausedMs) * time.Millisecond)
		t.Running, t.StartedAt, t.PausedMs = true, &start, 0
	case "skip":
		if !t.Running && !paused {
			return t, ErrBadTimerAction
		}
		_, left := t.Phase(now)
		if t.Running {
			start := t.StartedAt.Add(-left)
			t.StartedAt = &start
		} else {
			t.PausedMs += left.Milliseconds()
		}
	case "reset":
		t.Running, t.StartedAt, t.PausedMs = false, nil, 0
	default:
		return t, ErrBadTimerAction
	}
	return t, nil
}

// GetTimer returns the room's timer, or the default if it was never used.
func (s *Store) GetTimer(ctx context.Context, roomID string) (Timer, error) {
	t := DefaultTimer()
	err := s.db.QueryRow(ctx, `
		SELECT focus_seconds, break_seconds, running, started_at, paused_ms, updated_by::text, updated_at
		FROM room_timers WHERE room_id = $1`, roomID).
		Scan(&t.FocusSeconds, &t.BreakSeconds, &t.Running, &t.StartedAt, &t.PausedMs, &t.UpdatedBy, &t.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return DefaultTimer(), nil
	}
	return t, err
}

// ControlTimer applies an action atomically, so concurrent clicks from two
// moderators can't interleave, and returns the new state.
func (s *Store) ControlTimer(ctx context.Context, roomID, userID string, a TimerAction) (Timer, error) {
	var out Timer
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		// Make sure the row exists, then lock it.
		if _, err := tx.Exec(ctx, `INSERT INTO room_timers (room_id) VALUES ($1) ON CONFLICT DO NOTHING`, roomID); err != nil {
			return err
		}
		t := DefaultTimer()
		if err := tx.QueryRow(ctx, `
			SELECT focus_seconds, break_seconds, running, started_at, paused_ms
			FROM room_timers WHERE room_id = $1 FOR UPDATE`, roomID).
			Scan(&t.FocusSeconds, &t.BreakSeconds, &t.Running, &t.StartedAt, &t.PausedMs); err != nil {
			return err
		}
		// Use the database clock so every instance agrees on time.
		var now time.Time
		if err := tx.QueryRow(ctx, `SELECT now()`).Scan(&now); err != nil {
			return err
		}
		next, err := t.Apply(a, now)
		if err != nil {
			return err
		}
		return tx.QueryRow(ctx, `
			UPDATE room_timers
			SET focus_seconds = $2, break_seconds = $3, running = $4, started_at = $5, paused_ms = $6,
			    updated_by = $7, updated_at = now()
			WHERE room_id = $1
			RETURNING focus_seconds, break_seconds, running, started_at, paused_ms, updated_by::text, updated_at`,
			roomID, next.FocusSeconds, next.BreakSeconds, next.Running, next.StartedAt, next.PausedMs, userID).
			Scan(&out.FocusSeconds, &out.BreakSeconds, &out.Running, &out.StartedAt, &out.PausedMs, &out.UpdatedBy, &out.UpdatedAt)
	})
	return out, err
}
