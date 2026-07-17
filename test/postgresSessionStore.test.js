import assert from "node:assert/strict";
import test from "node:test";
import { newDb } from "pg-mem";
import { DATABASE_MIGRATIONS } from "../src/migrations.js";
import { PostgresRefreshSessionStore } from "../src/sessionStore.js";

test("PostgreSQL migration and session store rotate and revoke token families", async () => {
  const database = newDb();
  for (const migration of DATABASE_MIGRATIONS) {
    database.public.none(migration.sql);
  }
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();
  const store = new PostgresRefreshSessionStore(pool);
  const session = {
    id: "00000000-0000-4000-8000-000000000001",
    familyId: "00000000-0000-4000-8000-000000000001",
    tokenHash: "a".repeat(64),
    user: { id: "ident!test", email: "user@example.com" },
    expiresAt: new Date(Date.now() + 60_000),
    familyExpiresAt: new Date(Date.now() + 60_000)
  };
  const replacement = {
    id: "00000000-0000-4000-8000-000000000002",
    tokenHash: "b".repeat(64)
  };

  try {
    await store.createSession(session);
    const rotated = await store.rotateSession({
      id: session.id,
      tokenHash: session.tokenHash,
      replacement
    });
    assert.equal(rotated.status, "rotated");
    assert.deepEqual(rotated.user, session.user);

    const concurrent = await store.rotateSession({
      id: session.id,
      tokenHash: session.tokenHash,
      replacement
    });
    assert.equal(concurrent.status, "rotated");
    assert.deepEqual(concurrent.user, session.user);

    await pool.query(
      "UPDATE auth_refresh_sessions SET consumed_at = NOW() - INTERVAL '10 seconds' WHERE id = $1",
      [session.id]
    );
    const replayed = await store.rotateSession({
      id: session.id,
      tokenHash: session.tokenHash,
      replacement
    });
    assert.equal(replayed.status, "replayed");

    const currentAfterReplay = await store.rotateSession({
      id: replacement.id,
      tokenHash: replacement.tokenHash,
      replacement: { ...replacement, id: "00000000-0000-4000-8000-000000000004" }
    });
    assert.equal(currentAfterReplay.status, "replayed");

    const records = await pool.query(
      `SELECT id, consumed_at, revoked_at, expires_at, family_expires_at
         FROM auth_refresh_sessions
        ORDER BY id`
    );
    assert.equal(records.rows.length, 2);
    assert.ok(records.rows.every((row) => row.revoked_at));
    assert.ok(records.rows.every((row) => row.expires_at.getTime() === session.familyExpiresAt.getTime()));
    assert.ok(records.rows.every((row) => row.family_expires_at.getTime() === session.familyExpiresAt.getTime()));
  } finally {
    await pool.end();
  }
});

test("PostgreSQL session store prepares its schema once before use", async () => {
  let preparations = 0;
  const inserts = [];
  const pool = {
    query: async (sql) => {
      inserts.push(sql);
    }
  };
  const store = new PostgresRefreshSessionStore(pool, {
    prepare: async () => {
      preparations += 1;
    }
  });
  const session = {
    id: "00000000-0000-4000-8000-000000000001",
    familyId: "00000000-0000-4000-8000-000000000001",
    tokenHash: "a".repeat(64),
    user: { id: "ident!test", email: "user@example.com" },
    expiresAt: new Date(Date.now() + 60_000),
    familyExpiresAt: new Date(Date.now() + 60_000)
  };

  await Promise.all([store.createSession(session), store.createSession(session)]);

  assert.equal(preparations, 1);
  assert.equal(inserts.length, 2);
});
