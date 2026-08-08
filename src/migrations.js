const MIGRATION_LOCK_NAME = "bypass-links-schema-migrations";
export const DATABASE_MIGRATIONS = Object.freeze([
  {
    name: "001_refresh_sessions.sql",
    sql: `CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
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
  ON auth_refresh_sessions (expires_at);`
  },
  {
    name: "002_session_rotation_guards.sql",
    sql: `ALTER TABLE auth_refresh_sessions
  ADD COLUMN IF NOT EXISTS family_expires_at TIMESTAMPTZ;

UPDATE auth_refresh_sessions
   SET family_expires_at = expires_at
 WHERE family_expires_at IS NULL;

ALTER TABLE auth_refresh_sessions
  ALTER COLUMN family_expires_at SET NOT NULL;

ALTER TABLE auth_refresh_sessions
  ADD COLUMN IF NOT EXISTS replacement_id UUID;`
  },
  {
    name: "003_oauth_login_attempts.sql",
    sql: `CREATE TABLE IF NOT EXISTS oauth_login_attempts (
  state_hash CHAR(64) PRIMARY KEY,
  provider TEXT NOT NULL,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  return_to TEXT NOT NULL DEFAULT '/',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS oauth_login_attempts_expires_at_idx
  ON oauth_login_attempts (expires_at);`
  }
]);

export async function runDatabaseMigrations(pool, { log = console.log } = {}) {
  const client = await pool.connect();
  let locked = false;

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_NAME]);
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    for (const migration of DATABASE_MIGRATIONS) {
      const existing = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [migration.name]);
      if (existing.rowCount > 0) {
        continue;
      }

      try {
        await client.query("BEGIN");
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
        await client.query("COMMIT");
        log(`Applied migration ${migration.name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      if (locked) {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_NAME]);
      }
    } finally {
      client.release();
    }
  }
}
