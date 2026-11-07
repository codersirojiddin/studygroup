DROP INDEX IF EXISTS users_display_name_prefix_idx;
DROP INDEX IF EXISTS users_username_prefix_idx;
DROP INDEX IF EXISTS users_username_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_format;
ALTER TABLE users
    DROP COLUMN IF EXISTS profile_public,
    DROP COLUMN IF EXISTS bio,
    DROP COLUMN IF EXISTS username;
