-- Public profiles: a unique handle, a short bio and a visibility switch.
-- username stays NULL until the user claims one, so existing rows are valid.
ALTER TABLE users
    ADD COLUMN username        text,
    ADD COLUMN bio             text    NOT NULL DEFAULT '' CHECK (char_length(bio) <= 160),
    ADD COLUMN profile_public  boolean NOT NULL DEFAULT true;

-- Handles are stored lowercase (enforced here), so a plain unique index is
-- already case-insensitive. NULLs never collide.
ALTER TABLE users
    ADD CONSTRAINT users_username_format CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$');
CREATE UNIQUE INDEX users_username_key ON users (username);

-- Prefix search (LIKE 'abc%') on handle and on display name.
CREATE INDEX users_username_prefix_idx ON users (username text_pattern_ops);
CREATE INDEX users_display_name_prefix_idx ON users (lower(display_name) text_pattern_ops);
