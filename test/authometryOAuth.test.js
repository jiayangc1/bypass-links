import assert from "node:assert/strict";
import test from "node:test";
import {
  createAuthometryOAuthClient,
  normalizeAuthometryUser,
  safeReturnPath
} from "../src/authometryOAuth.js";
import { InMemoryOAuthAttemptStore } from "../src/oauthAttemptStore.js";

const issuer = "https://authometry.example.com";

test("creates unique Authometry authorization attempts with nonce and S256 PKCE", async () => {
  const oauth = createAuthometryOAuthClient({
    issuer,
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "https://app.example.com/auth/authometry/callback",
    fetchImpl: async (url) => {
      assert.equal(url, `${issuer}/.well-known/openid-configuration`);
      return globalThis.Response.json(discoveryDocument());
    }
  });

  const first = await oauth.createAuthorizationAttempt("/privacy");
  const second = await oauth.createAuthorizationAttempt("/");
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.codeVerifier, second.codeVerifier);
  assert.equal(first.authorizationUrl.searchParams.get("state"), first.state);
  assert.equal(first.authorizationUrl.searchParams.get("nonce"), first.nonce);
  assert.equal(first.authorizationUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(first.authorizationUrl.searchParams.get("scope"), "openid profile email");
  assert.equal(first.authorizationUrl.searchParams.has("code_verifier"), false);
});

test("normalizes only verified Authometry identities using issuer and subject", () => {
  const first = normalizeAuthometryUser({
    iss: issuer,
    sub: "user-123",
    email: "user@example.com",
    email_verified: true,
    name: "Example User"
  }, issuer);
  const second = normalizeAuthometryUser({
    iss: "https://other.example.com",
    sub: "user-123",
    email: "user@example.com",
    email_verified: true
  }, "https://other.example.com");

  assert.equal(first.provider, "authometry");
  assert.equal(first.subject, "user-123");
  assert.notEqual(first.id, second.id);
  assert.throws(() => normalizeAuthometryUser({
    iss: issuer,
    sub: "user-123",
    email: "user@example.com",
    email_verified: false
  }, issuer), /verified email/);
  assert.throws(() => normalizeAuthometryUser({
    iss: "https://wrong.example.com",
    sub: "user-123",
    email: "user@example.com",
    email_verified: true
  }, issuer), /verified email/);
});

test("accepts only same-origin relative return paths", () => {
  assert.equal(safeReturnPath("/privacy?from=login#details"), "/privacy?from=login#details");
  for (const unsafe of [
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example/",
    "/%2f%2fevil.example/",
    "/%5cevil.example/",
    "/bad%zz"
  ]) {
    assert.equal(safeReturnPath(unsafe), "/");
  }
});

test("OAuth attempts are consumed exactly once", async () => {
  const store = new InMemoryOAuthAttemptStore();
  const attempt = { state: "state", nonce: "nonce", codeVerifier: "verifier", returnTo: "/" };
  await store.createAttempt(attempt);
  const consumed = await store.consumeAttempt("state");
  assert.deepEqual({
    state: consumed.state,
    nonce: consumed.nonce,
    codeVerifier: consumed.codeVerifier,
    returnTo: consumed.returnTo
  }, attempt);
  assert.ok(consumed.expiresAt instanceof Date);
  assert.equal(await store.consumeAttempt("state"), null);
  assert.equal(await store.consumeAttempt("modified"), null);
});

function discoveryDocument() {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic"],
    code_challenge_methods_supported: ["S256"]
  };
}
