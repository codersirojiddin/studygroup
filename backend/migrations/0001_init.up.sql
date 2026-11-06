-- Application schema. Lives in "public", separate from Neon's managed
-- "neon_auth" schema, which must never be modified by these migrations.
-- users.auth_user_id stores the Neon Auth user id (the JWT "sub" claim);
-- there is deliberately no foreign key into neon_auth.

CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id  text NOT NULL UNIQUE,
    email         text NOT NULL,
    display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 100),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    description   text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
    visibility    text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
    max_members   integer NOT NULL DEFAULT 20 CHECK (max_members BETWEEN 1 AND 500),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rooms_owner_id_idx ON rooms (owner_id);
CREATE INDEX rooms_public_created_idx ON rooms (created_at DESC) WHERE visibility = 'public';

CREATE TABLE room_members (
    room_id    uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member')),
    joined_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, user_id)
);
CREATE INDEX room_members_user_id_idx ON room_members (user_id);

CREATE TABLE study_sessions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    room_id     uuid REFERENCES rooms (id) ON DELETE SET NULL,
    started_at  timestamptz NOT NULL DEFAULT now(),
    ended_at    timestamptz,
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX study_sessions_user_started_idx ON study_sessions (user_id, started_at DESC);
CREATE INDEX study_sessions_room_id_idx ON study_sessions (room_id) WHERE room_id IS NOT NULL;
-- A user can have at most one session running at a time.
CREATE UNIQUE INDEX study_sessions_one_active_per_user ON study_sessions (user_id) WHERE ended_at IS NULL;
