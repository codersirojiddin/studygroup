DROP INDEX IF EXISTS study_sessions_room_started_idx;
DROP TABLE IF EXISTS todos;
ALTER TABLE users DROP COLUMN IF EXISTS daily_goal_minutes;
DROP TABLE IF EXISTS chat_messages;
