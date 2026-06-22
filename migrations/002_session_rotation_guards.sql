ALTER TABLE auth_refresh_sessions
  ADD COLUMN IF NOT EXISTS family_expires_at TIMESTAMPTZ;

UPDATE auth_refresh_sessions
   SET family_expires_at = expires_at
 WHERE family_expires_at IS NULL;

ALTER TABLE auth_refresh_sessions
  ALTER COLUMN family_expires_at SET NOT NULL;

ALTER TABLE auth_refresh_sessions
  ADD COLUMN IF NOT EXISTS replacement_id UUID;
