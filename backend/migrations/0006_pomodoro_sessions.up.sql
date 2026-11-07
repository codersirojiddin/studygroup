-- The room Pomodoro can drive a user's study session. There is still only one
-- running session per user (study_sessions_one_active_per_user), so a manual
-- session and the Pomodoro can never both count the same minutes.
--
-- source:  'manual' = the user pressed Start, 'pomodoro' = started by the room timer
-- ends_at: hard stop for pomodoro sessions, the end of the focus phase they
--          started in. Durations are capped there even if nobody stops the
--          session (closed tab, lost connection).
ALTER TABLE study_sessions
    ADD COLUMN source  text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'pomodoro')),
    ADD COLUMN ends_at timestamptz;

ALTER TABLE study_sessions
    ADD CONSTRAINT study_sessions_ends_at_check CHECK (ends_at IS NULL OR ends_at >= started_at),
    ADD CONSTRAINT study_sessions_pomodoro_ends_check CHECK (source = 'manual' OR ends_at IS NOT NULL);
