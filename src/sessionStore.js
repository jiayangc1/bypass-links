import crypto from "node:crypto";

export class PostgresRefreshSessionStore {
  constructor(pool, { prepare = null, replayGraceMs = 5_000 } = {}) {
    this.pool = pool;
    this.prepare = prepare;
    this.preparation = null;
    this.replayGraceMs = replayGraceMs;
  }

  async createSession(session) {
    await this.ensureReady();
    await this.pool.query(
      `INSERT INTO auth_refresh_sessions
        (id, family_id, token_hash, user_data, expires_at, family_expires_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        session.id,
        session.familyId,
        session.tokenHash,
        JSON.stringify(session.user),
        session.expiresAt,
        session.familyExpiresAt
      ]
    );
  }

  async rotateSession({ id, tokenHash, replacement }) {
    await this.ensureReady();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT id, family_id, token_hash, user_data, expires_at, family_expires_at,
                consumed_at, replacement_id, revoked_at
           FROM auth_refresh_sessions
          WHERE id = $1
          FOR UPDATE`,
        [id]
      );
      const session = result.rows[0];

      if (!session || !hashesMatch(session.token_hash, tokenHash) || new Date(session.expires_at) <= new Date()) {
        await client.query("ROLLBACK");
        return { status: "invalid" };
      }

      const withinGrace = session.consumed_at
        && new Date(session.consumed_at).getTime() >= Date.now() - this.replayGraceMs;
      if (
        withinGrace
        && !session.revoked_at
        && session.replacement_id === replacement.id
      ) {
        await client.query("COMMIT");
        return {
          status: "rotated",
          user: session.user_data,
          expiresAt: session.family_expires_at
        };
      }

      if (session.consumed_at || session.revoked_at) {
        await client.query(
          `UPDATE auth_refresh_sessions
              SET revoked_at = COALESCE(revoked_at, NOW())
            WHERE family_id = $1`,
          [session.family_id]
        );
        await client.query("COMMIT");
        return { status: "replayed" };
      }

      await client.query(
        "UPDATE auth_refresh_sessions SET consumed_at = NOW(), replacement_id = $2 WHERE id = $1",
        [id, replacement.id]
      );
      await client.query(
        `INSERT INTO auth_refresh_sessions
          (id, family_id, token_hash, user_data, expires_at, family_expires_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $5)`,
        [
          replacement.id,
          session.family_id,
          replacement.tokenHash,
          JSON.stringify(session.user_data),
          session.family_expires_at
        ]
      );
      await client.query("COMMIT");
      return {
        status: "rotated",
        user: session.user_data,
        expiresAt: session.family_expires_at
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeSession({ id, tokenHash }) {
    await this.ensureReady();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT family_id, token_hash
           FROM auth_refresh_sessions
          WHERE id = $1
          FOR UPDATE`,
        [id]
      );
      const session = result.rows[0];
      if (session && hashesMatch(session.token_hash, tokenHash)) {
        await client.query(
          `UPDATE auth_refresh_sessions
              SET revoked_at = COALESCE(revoked_at, NOW())
            WHERE family_id = $1`,
          [session.family_id]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async ensureReady() {
    if (!this.prepare) {
      return;
    }

    if (!this.preparation) {
      this.preparation = Promise.resolve().then(this.prepare);
    }

    try {
      await this.preparation;
    } catch (error) {
      this.preparation = null;
      throw error;
    }
  }
}

export class InMemoryRefreshSessionStore {
  constructor({ replayGraceMs = 5_000 } = {}) {
    this.sessions = new Map();
    this.replayGraceMs = replayGraceMs;
  }

  async createSession(session) {
    this.sessions.set(session.id, globalThis.structuredClone({
      ...session,
      consumedAt: null,
      replacementId: null,
      revokedAt: null
    }));
  }

  async rotateSession({ id, tokenHash, replacement }) {
    const session = this.sessions.get(id);
    if (!session || !hashesMatch(session.tokenHash, tokenHash) || new Date(session.expiresAt) <= new Date()) {
      return { status: "invalid" };
    }

    const withinGrace = session.consumedAt
      && new Date(session.consumedAt).getTime() >= Date.now() - this.replayGraceMs;
    if (withinGrace && !session.revokedAt && session.replacementId === replacement.id) {
      return {
        status: "rotated",
        user: globalThis.structuredClone(session.user),
        expiresAt: new Date(session.familyExpiresAt)
      };
    }

    if (session.consumedAt || session.revokedAt) {
      this.revokeFamily(session.familyId);
      return { status: "replayed" };
    }

    session.consumedAt = new Date();
    session.replacementId = replacement.id;
    this.sessions.set(replacement.id, globalThis.structuredClone({
      ...replacement,
      familyId: session.familyId,
      user: session.user,
      expiresAt: session.familyExpiresAt,
      familyExpiresAt: session.familyExpiresAt,
      consumedAt: null,
      replacementId: null,
      revokedAt: null
    }));
    return {
      status: "rotated",
      user: globalThis.structuredClone(session.user),
      expiresAt: new Date(session.familyExpiresAt)
    };
  }

  async revokeSession({ id, tokenHash }) {
    const session = this.sessions.get(id);
    if (session && hashesMatch(session.tokenHash, tokenHash)) {
      this.revokeFamily(session.familyId);
    }
  }

  revokeFamily(familyId) {
    const revokedAt = new Date();
    for (const session of this.sessions.values()) {
      if (session.familyId === familyId && !session.revokedAt) {
        session.revokedAt = revokedAt;
      }
    }
  }
}

function hashesMatch(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
