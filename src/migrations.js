import fs from "node:fs/promises";

const MIGRATION_LOCK_NAME = "bypass-links-schema-migrations";
const MIGRATIONS = [
  {
    name: "001_refresh_sessions.sql",
    url: new URL("../migrations/001_refresh_sessions.sql", import.meta.url)
  },
  {
    name: "002_session_rotation_guards.sql",
    url: new URL("../migrations/002_session_rotation_guards.sql", import.meta.url)
  }
];

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

    for (const migration of MIGRATIONS) {
      const existing = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [migration.name]);
      if (existing.rowCount > 0) {
        continue;
      }

      const sql = await fs.readFile(migration.url, "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
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
