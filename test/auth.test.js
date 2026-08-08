import assert from "node:assert/strict";
import test from "node:test";
import { createAuthService } from "../src/auth.js";
import { InMemoryRefreshSessionStore } from "../src/sessionStore.js";

const user = { id: "ident!test", email: "user@example.com", name: "Test User" };

test("makes concurrent refresh rotation idempotent and revokes the family on late replay", async () => {
  const sessionStore = new InMemoryRefreshSessionStore();
  const auth = createAuthService({
    accessSecret: "test-access-secret",
    isProduction: false,
    sessionStore
  });
  const initialResponse = createCookieResponse();
  await auth.startSession(initialResponse, user);
  const initialRefresh = initialResponse.cookies.get("refresh_token").value;
  const initialMaxAge = initialResponse.cookies.get("refresh_token").options.maxAge;

  const rotatedResponse = createCookieResponse();
  const refreshedUser = await auth.refreshSession(createCookieRequest(initialRefresh), rotatedResponse);
  assert.deepEqual(refreshedUser, user);
  const rotatedRefresh = rotatedResponse.cookies.get("refresh_token").value;
  assert.notEqual(rotatedRefresh, initialRefresh);
  assert.ok(rotatedResponse.cookies.get("refresh_token").options.maxAge <= initialMaxAge);

  const concurrentResponse = createCookieResponse();
  assert.deepEqual(await auth.refreshSession(createCookieRequest(initialRefresh), concurrentResponse), user);
  assert.equal(concurrentResponse.cookies.get("refresh_token").value, rotatedRefresh);

  const currentResponse = createCookieResponse();
  assert.deepEqual(await auth.refreshSession(createCookieRequest(rotatedRefresh), currentResponse), user);
  const currentRefresh = currentResponse.cookies.get("refresh_token").value;

  const initialId = initialRefresh.split(".")[0];
  sessionStore.sessions.get(initialId).consumedAt = new Date(Date.now() - 10_000);
  const replayResponse = createCookieResponse();
  assert.equal(await auth.refreshSession(createCookieRequest(initialRefresh), replayResponse), null);

  const familyResponse = createCookieResponse();
  assert.equal(await auth.refreshSession(createCookieRequest(currentRefresh), familyResponse), null);
});

test("logout revokes the active refresh family and clears cookies", async () => {
  const auth = createAuthService({
    accessSecret: "test-access-secret",
    isProduction: false,
    sessionStore: new InMemoryRefreshSessionStore()
  });
  const startResponse = createCookieResponse();
  await auth.startSession(startResponse, user);
  const refreshToken = startResponse.cookies.get("refresh_token").value;

  const logoutResponse = createCookieResponse();
  await auth.logout(createCookieRequest(refreshToken), logoutResponse);
  assert.deepEqual([...logoutResponse.cleared].sort(), ["access_token", "refresh_token"]);

  const refreshResponse = createCookieResponse();
  assert.equal(await auth.refreshSession(createCookieRequest(refreshToken), refreshResponse), null);
});

test("logout still clears browser cookies when session revocation fails", async () => {
  const auth = createAuthService({
    accessSecret: "test-access-secret",
    isProduction: false,
    sessionStore: {
      revokeSession: async () => { throw new Error("database unavailable"); }
    }
  });
  const response = createCookieResponse();
  await assert.rejects(auth.logout(createCookieRequest(`${cryptoUuid()}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`), response));
  assert.deepEqual([...response.cleared].sort(), ["access_token", "refresh_token"]);
});

test("replaces an existing session after OAuth login", async () => {
  const sessionStore = new InMemoryRefreshSessionStore();
  const auth = createAuthService({
    accessSecret: "test-access-secret",
    isProduction: false,
    sessionStore
  });
  const initialResponse = createCookieResponse();
  await auth.startSession(initialResponse, user);
  const initialRefresh = initialResponse.cookies.get("refresh_token").value;

  const replacementUser = { id: "authometry:user", email: "new@example.com", name: "New User" };
  const replacementResponse = createCookieResponse();
  await auth.replaceSession(createCookieRequest(initialRefresh), replacementResponse, replacementUser);
  const replacementRefresh = replacementResponse.cookies.get("refresh_token").value;
  assert.notEqual(replacementRefresh, initialRefresh);

  assert.equal(await auth.refreshSession(createCookieRequest(initialRefresh), createCookieResponse()), null);
  assert.deepEqual(
    await auth.refreshSession(createCookieRequest(replacementRefresh), createCookieResponse()),
    replacementUser
  );
});

function createCookieRequest(refreshToken) {
  return { cookies: { refresh_token: refreshToken } };
}

function createCookieResponse() {
  return {
    cookies: new Map(),
    cleared: new Set(),
    cookie(name, value, options) {
      this.cookies.set(name, { value, options });
    },
    clearCookie(name) {
      this.cleared.add(name);
    }
  };
}

function cryptoUuid() {
  return "00000000-0000-4000-8000-000000000000";
}
