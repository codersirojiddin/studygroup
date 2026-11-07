ALTER TABLE study_sessions
    DROP CONSTRAINT IF EXISTS study_sessions_pomodoro_ends_check,
    DROP CONSTRAINT IF EXISTS study_sessions_ends_at_check,
    DROP COLUMN IF EXISTS ends_at,
    DROP COLUMN IF EXISTS source;
