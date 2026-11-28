-- Session activity tracking (15-minute inactivity timeout + owner "who is online"),
-- account impersonation for the owner, and one-time codes for the destructive full reset.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS impersonated_by uuid REFERENCES users(id) ON DELETE CASCADE;
COMMENT ON COLUMN sessions.last_seen_at IS 'Updated (at most once per minute per request) whenever the session is used. Sessions idle for more than 15 minutes are rejected.';
COMMENT ON COLUMN sessions.impersonated_by IS 'Set when an owner switched into this account (impersonation). NULL = normal session.';
CREATE INDEX IF NOT EXISTS sessions_user_last_seen ON sessions (user_id, last_seen_at DESC);

-- One-time confirmation codes for destructive owner actions (currently: full DB reset).
CREATE TABLE IF NOT EXISTS reset_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  code_hash text NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reset_codes_requested_by ON reset_codes (requested_by, created_at DESC);

-- Backfill usernames for existing accounts from display name (unique, lowercase slugs).
WITH slugs AS (
  SELECT id,
         coalesce(nullif(lower(regexp_replace(btrim(name), '[^a-zA-Z0-9]+', '-', 'g')), ''),
                  nullif(lower(split_part(email, '@', 1)), ''),
                  'user') AS base
  FROM users
  WHERE username IS NULL
),
ranked AS (
  SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY id) AS rn
  FROM slugs
)
UPDATE users u
SET username = CASE WHEN r.rn = 1 THEN r.base ELSE r.base || '-' || r.rn END
FROM ranked r
WHERE u.id = r.id AND u.username IS NULL;
