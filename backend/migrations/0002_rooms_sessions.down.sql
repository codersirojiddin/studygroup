DROP INDEX IF EXISTS study_sessions_user_ended_idx;
ALTER TABLE study_sessions DROP COLUMN IF EXISTS topic;
ALTER TABLE rooms DROP COLUMN IF EXISTS invite_code;
