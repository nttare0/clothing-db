-- Staff accounts: optional automatic expiry + password age tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL;
CREATE INDEX IF NOT EXISTS users_active_until ON users (active_until) WHERE active_until IS NOT NULL;
COMMENT ON COLUMN users.active_until IS 'When set, the account is automatically deactivated at this timestamp (lazily enforced at sign-in and on session validation). NULL = no expiry.';
COMMENT ON COLUMN users.password_changed_at IS 'Last time the password was set (create / reset / change). Shown to the owner in Staff & Permissions.';
