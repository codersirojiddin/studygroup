-- Social profile links, shown on the public profile. Only handles are stored
-- (e.g. {"instagram": "zoe", "telegram": "zoe_k"}); the app builds the URLs.
ALTER TABLE users
    ADD COLUMN socials jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(socials) = 'object' AND octet_length(socials::text) <= 1000);
