-- Saved room chat. Soft-deleted so moderation leaves an audit trail.
CREATE TABLE chat_messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
    created_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz,
    deleted_by  uuid REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX chat_messages_room_created_idx ON chat_messages (room_id, created_at DESC);

-- Personal daily study goal.
ALTER TABLE users
    ADD COLUMN daily_goal_minutes integer NOT NULL DEFAULT 120
        CHECK (daily_goal_minutes BETWEEN 10 AND 1440);

-- Personal to-do list.
CREATE TABLE todos (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    done        boolean NOT NULL DEFAULT false,
    done_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CHECK (done = (done_at IS NOT NULL))
);
CREATE INDEX todos_user_open_idx ON todos (user_id, created_at) WHERE NOT done;
CREATE INDEX todos_user_done_idx ON todos (user_id, done_at DESC) WHERE done;

-- Leaderboards sum a room's sessions since the start of the week.
CREATE INDEX study_sessions_room_started_idx ON study_sessions (room_id, started_at)
    WHERE room_id IS NOT NULL;
