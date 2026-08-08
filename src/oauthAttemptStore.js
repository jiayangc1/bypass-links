import crypto from "node:crypto";

const ATTEMPT_TTL_MS = 10 * 60 * 1_000;

export class PostgresOAuthAttemptStore {
  constructor(pool, { prepare = null } = {}) {
    this.pool = pool;
    this.prepare = prepare;
    this.preparation = null;
  }

  async createAttempt(attempt) {
    await this.ensureReady();
    await this.pool.query(
      `INSERT INTO oauth_login_attempts
        (state_hash, provider, nonce, code_verifier, return_to, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [hashState(attempt.state), "authometry", attempt.nonce, attempt.codeVerifier, attempt.returnTo, expiresAt()]
    );
  }

  async consumeAttempt(state) {
    await this.ensureReady();
    const result = await this.pool.query(
      `DELETE FROM oauth_login_attempts
        WHERE state_hash = $1
          AND provider = $2
          AND expires_at > NOW()
      RETURNING nonce, code_verifier, return_to`,
      [hashState(state), "authometry"]
    );
    const attempt = result.rows[0];
    if (!attempt) return null;
    return {
      state,
      nonce: attempt.nonce,
      codeVerifier: attempt.code_verifier,
      returnTo: attempt.return_to
    };
  }

  async ensureReady() {
    if (!this.prepare) return;
    if (!this.preparation) this.preparation = Promise.resolve().then(this.prepare);
    try {
      await this.preparation;
    } catch (error) {
      this.preparation = null;
      throw error;
    }
  }
}

export class InMemoryOAuthAttemptStore {
  constructor() {
    this.attempts = new Map();
  }

  async createAttempt(attempt) {
    this.attempts.set(hashState(attempt.state), {
      state: attempt.state,
      nonce: attempt.nonce,
      codeVerifier: attempt.codeVerifier,
      returnTo: attempt.returnTo,
      expiresAt: expiresAt()
    });
  }

  async consumeAttempt(state) {
    const key = hashState(state);
    const attempt = this.attempts.get(key);
    this.attempts.delete(key);
    if (!attempt || attempt.expiresAt <= new Date()) return null;
    return attempt;
  }
}

function hashState(state) {
  return crypto.createHash("sha256").update(state).digest("hex");
}

function expiresAt() {
  return new Date(Date.now() + ATTEMPT_TTL_MS);
}
