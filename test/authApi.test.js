import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import jwt from "jsonwebtoken";
import { UpstreamRateLimitError, UpstreamTimeoutError, UpstreamUnavailableError } from "../src/errors.js";
import { createApp } from "../src/server.js";
import { InMemoryOAuthAttemptStore } from "../src/oauthAttemptStore.js";

const accessSecret = "test-access-secret";
const testUser = {
  id: "ident!test",
  email: "user@example.com",
  name: "Test User"
};

test("rejects bypass API requests without authentication", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/bypass`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://linkvertise.com/example" })
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "unauthorized" });
  } finally {
    await close();
  }
});

test("authenticated bypass API requests call the bypass client", async () => {
  const bypassedRequests = [];
  const { baseUrl, close } = await startServer({
    bypassClient: {
      bypass: async (url, options) => {
        bypassedRequests.push({ url, options });
        return "https://download.example/file";
      }
    }
  });

  try {
    const response = await fetch(`${baseUrl}/api/bypass`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `access_token=${signAccessToken(testUser)}`
      },
      body: JSON.stringify({ url: "https://linkvertise.com/example", autoRedirect: false, refresh: true })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, result: "https://download.example/file" });
    assert.deepEqual(bypassedRequests, [
      { url: "https://linkvertise.com/example", options: { refresh: true } }
    ]);
  } finally {
    await close();
  }
});

test("OAuth callback rejects missing or invalid state", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/oauth/callback?code=abc&state=bad`, {
      redirect: "manual"
    });

    assert.equal(response.status, 400);
  } finally {
    await close();
  }
});

test("starts Authometry login with a stored single-use attempt", async () => {
  const attemptStore = new InMemoryOAuthAttemptStore();
  const authometryClient = {
    createAuthorizationAttempt: async (returnTo) => ({
      authorizationUrl: new URL("https://authometry.example.com/oauth/authorize?state=state-1"),
      state: "state-1",
      nonce: "nonce-1",
      codeVerifier: "verifier-1",
      returnTo
    })
  };
  const { baseUrl, close } = await startServer({ authometryClient, oauthAttemptStore: attemptStore });

  try {
    const response = await fetch(`${baseUrl}/auth/authometry?returnTo=%2Fprivacy`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://authometry.example.com/oauth/authorize?state=state-1");
    const attempt = await attemptStore.consumeAttempt("state-1");
    assert.equal(attempt.returnTo, "/privacy");
    assert.equal(attempt.codeVerifier, "verifier-1");
  } finally {
    await close();
  }
});

test("Authometry callback creates a local session and rejects state replay", async () => {
  const attemptStore = new InMemoryOAuthAttemptStore();
  await attemptStore.createAttempt({
    state: "state-1",
    nonce: "nonce-1",
    codeVerifier: "verifier-1",
    returnTo: "/privacy"
  });
  const completed = [];
  const authometryClient = {
    completeAuthorization: async (query, attempt) => {
      completed.push({ query, attempt });
      return { id: "authometry:user-1", email: "user@example.com", name: "Authometry User" };
    }
  };
  const { baseUrl, close } = await startServer({ authometryClient, oauthAttemptStore: attemptStore });

  try {
    const response = await fetch(`${baseUrl}/auth/authometry/callback?code=code-1&state=state-1`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/privacy");
    assert.equal(completed.length, 1);
    assert.match(response.headers.getSetCookie().join(";"), /access_token=/);
    assert.match(response.headers.getSetCookie().join(";"), /refresh_token=/);

    const replay = await fetch(`${baseUrl}/auth/authometry/callback?code=code-1&state=state-1`, { redirect: "manual" });
    assert.equal(replay.status, 400);
  } finally {
    await close();
  }
});

test("Authometry callback consumes state when the provider returns an error", async () => {
  const attemptStore = new InMemoryOAuthAttemptStore();
  await attemptStore.createAttempt({
    state: "state-1",
    nonce: "nonce-1",
    codeVerifier: "verifier-1",
    returnTo: "/"
  });
  const { baseUrl, close } = await startServer({
    authometryClient: { completeAuthorization: async () => { throw new Error("must not run"); } },
    oauthAttemptStore: attemptStore
  });

  try {
    const response = await fetch(`${baseUrl}/auth/authometry/callback?error=access_denied&state=state-1`);
    assert.equal(response.status, 400);
    assert.equal(await attemptStore.consumeAttempt("state-1"), null);
  } finally {
    await close();
  }
});

test("me API returns the user from a valid access token", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/me`, {
      headers: {
        cookie: `access_token=${signAccessToken(testUser)}`
      }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, user: testUser });
  } finally {
    await close();
  }
});

test("session API returns null user without authentication", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/session`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, user: null });
  } finally {
    await close();
  }
});

test("rejects private-network bypass URLs before calling the client", async () => {
  let called = false;
  const { baseUrl, close } = await startServer({
    bypassClient: { bypass: async () => { called = true; } }
  });
  try {
    const response = await authenticatedBypass(baseUrl, "http://127.0.0.1/admin");
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, error: "invalid_url" });
    assert.equal(called, false);
  } finally {
    await close();
  }
});

for (const [error, status, code] of [
  [new UpstreamRateLimitError(7), 429, "rate_limited"],
  [new UpstreamUnavailableError(), 502, "upstream_unavailable"],
  [new UpstreamTimeoutError(), 504, "upstream_timeout"]
]) {
  test(`maps ${code} failures to HTTP ${status}`, async () => {
    const { baseUrl, close } = await startServer({
      bypassClient: { bypass: async () => { throw error; } }
    });
    try {
      const response = await authenticatedBypass(baseUrl, "https://linkvertise.com/example");
      assert.equal(response.status, status);
      const payload = await response.json();
      assert.equal(payload.error, code);
      if (code === "rate_limited") assert.equal(payload.retryAfter, 7);
    } finally {
      await close();
    }
  });
}

async function startServer(options = {}) {
  const app = createApp({
    telegramWebhookSecret: "secret",
    bypassClient: options.bypassClient || {
      bypass: async () => "https://download.example/file"
    },
    telegramClient: {
      sendMessage: async () => {}
    },
    authConfig: {
      jwtAccessSecret: accessSecret,
      isProduction: false
    },
    authometryClient: options.authometryClient,
    oauthAttemptStore: options.oauthAttemptStore,
    serveClient: false
  });

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    baseUrl: `http://${address.address}:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, user }, accessSecret, {
    expiresIn: "15m"
  });
}

function authenticatedBypass(baseUrl, url) {
  return fetch(`${baseUrl}/api/bypass`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `access_token=${signAccessToken(testUser)}`
    },
    body: JSON.stringify({ url })
  });
}
