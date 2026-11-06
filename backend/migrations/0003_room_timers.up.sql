-- Shared Pomodoro timer, one per room. The phase (focus/break) and time left
-- are derived from started_at and the durations, so the server never ticks:
--   idle:    running = false, paused_ms = 0
--   running: running = true,  started_at = anchor of the first focus phase
--   paused:  running = false, paused_ms = elapsed time when paused
CREATE TABLE room_timers (
    room_id        uuid PRIMARY KEY REFERENCES rooms (id) ON DELETE CASCADE,
    focus_seconds  integer NOT NULL DEFAULT 1500 CHECK (focus_seconds BETWEEN 60 AND 10800),
    break_seconds  integer NOT NULL DEFAULT 300 CHECK (break_seconds BETWEEN 60 AND 3600),
    running        boolean NOT NULL DEFAULT false,
    started_at     timestamptz,
    paused_ms      bigint NOT NULL DEFAULT 0 CHECK (paused_ms >= 0),
    updated_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (running = (started_at IS NOT NULL)),
    CHECK (NOT running OR paused_ms = 0)
);
