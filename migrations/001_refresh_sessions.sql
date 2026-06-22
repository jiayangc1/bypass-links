CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_refresh_sessions_family_id_idx
  ON auth_refresh_sessions (family_id);

CREATE INDEX IF NOT EXISTS auth_refresh_sessions_expires_at_idx
  ON auth_refresh_sessions (expires_at);
