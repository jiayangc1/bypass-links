import crypto from "node:crypto";
import * as oidc from "openid-client";

const AUTHOMETRY_SCOPES = "openid profile email";

export function createAuthometryOAuthClient({
  issuer,
  clientId,
  clientSecret,
  redirectUri,
  fetchImpl = fetch,
  timeoutMs = 8_000
}) {
  const issuerUrl = new URL(issuer);
  const callbackUrl = new URL(redirectUri);
  let configurationPromise;

  async function getConfiguration() {
    if (!configurationPromise) {
      configurationPromise = oidc.discovery(
        issuerUrl,
        clientId,
        { client_secret: clientSecret },
        oidc.ClientSecretBasic(clientSecret),
        {
          [oidc.customFetch]: fetchImpl,
          timeout: Math.max(1, Math.ceil(timeoutMs / 1_000))
        }
      ).then((configuration) => {
        const metadata = configuration.serverMetadata();
        if (metadata.issuer !== issuerUrl.toString().replace(/\/$/, "")) {
          throw new Error("Authometry discovery returned an unexpected issuer.");
        }
        if (!metadata.token_endpoint_auth_methods_supported?.includes("client_secret_basic")) {
          throw new Error("Authometry does not advertise client_secret_basic for this web client.");
        }
        return configuration;
      }).catch((error) => {
        configurationPromise = undefined;
        throw error;
      });
    }
    return configurationPromise;
  }

  async function createAuthorizationAttempt(returnTo = "/") {
    const configuration = await getConfiguration();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: callbackUrl.toString(),
      response_type: "code",
      scope: AUTHOMETRY_SCOPES,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });

    return { authorizationUrl, state, nonce, codeVerifier, returnTo };
  }

  async function completeAuthorization(query, attempt) {
    const configuration = await getConfiguration();
    const currentUrl = new URL(callbackUrl);
    for (const [name, value] of Object.entries(query)) {
      if (typeof value === "string") currentUrl.searchParams.set(name, value);
    }
    const tokens = await oidc.authorizationCodeGrant(configuration, currentUrl, {
      expectedNonce: attempt.nonce,
      expectedState: attempt.state,
      pkceCodeVerifier: attempt.codeVerifier
    });
    const claims = tokens.claims();
    if (!claims) throw new Error("Authometry did not return an ID token.");
    return normalizeAuthometryUser(claims, issuerUrl.toString().replace(/\/$/, ""));
  }

  return { completeAuthorization, createAuthorizationAttempt, getConfiguration };
}

export function normalizeAuthometryUser(claims = {}, expectedIssuer) {
  if (
    typeof claims.iss !== "string"
    || claims.iss !== expectedIssuer
    || typeof claims.sub !== "string"
    || !claims.sub
    || typeof claims.email !== "string"
    || !claims.email
    || claims.email_verified !== true
  ) {
    throw new Error("Authometry identity claims were missing a verified email or stable subject.");
  }

  const identityKey = crypto.createHash("sha256")
    .update(claims.iss)
    .update("\0")
    .update(claims.sub)
    .digest("base64url");

  return {
    id: `authometry:${identityKey}`,
    email: claims.email,
    name: stringClaim(claims.name) || stringClaim(claims.preferred_username) || claims.email,
    provider: "authometry",
    issuer: claims.iss,
    subject: claims.sub
  };
}

export function safeReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\") || hasControlCharacter(value) || /%(?:2f|5c)/i.test(value)) return "/";
  try {
    decodeURIComponent(value);
    const parsed = new URL(value, "https://return.invalid");
    if (parsed.origin !== "https://return.invalid") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function stringClaim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127;
  });
}
