import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { InMemoryRefreshSessionStore } from "./sessionStore.js";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const OAUTH_STATE_COOKIE = "hackclub_oauth_state";
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export function normalizeHackClubUser(payload = {}) {
  const identity = payload.identity || payload;
  const firstName = identity.first_name || "";
  const lastName = identity.last_name || "";
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    id: identity.id,
    email: identity.primary_email || identity.email,
    name: name || identity.name || identity.display_name || "",
    firstName,
    lastName
  };
}

export function createAuthService({
  accessSecret,
  isProduction = process.env.NODE_ENV === "production",
  sessionStore = new InMemoryRefreshSessionStore()
}) {
  function cookieOptions(maxAgeSeconds) {
    return {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: maxAgeSeconds * 1000,
      path: "/"
    };
  }

  function stateCookieOptions() {
    return {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 10 * 60 * 1000,
      path: "/"
    };
  }

  function signAccessToken(user) {
    return jwt.sign({ sub: user.id, user }, accessSecret, {
      algorithm: "HS256",
      expiresIn: ACCESS_TTL_SECONDS
    });
  }

  function setAccessCookie(response, user) {
    response.cookie(ACCESS_COOKIE, signAccessToken(user), cookieOptions(ACCESS_TTL_SECONDS));
  }

  function setRefreshCookie(response, token, expiresAt) {
    const remainingSeconds = Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
    response.cookie(REFRESH_COOKIE, token, cookieOptions(remainingSeconds));
  }

  function clearSessionCookies(response) {
    const options = cookieOptions(0);
    delete options.maxAge;
    response.clearCookie(ACCESS_COOKIE, options);
    response.clearCookie(REFRESH_COOKIE, options);
  }

  function createOauthState(response) {
    const state = crypto.randomBytes(24).toString("hex");
    response.cookie(OAUTH_STATE_COOKIE, state, stateCookieOptions());
    return state;
  }

  function verifyOauthState(request, response, state) {
    const cookieState = request.cookies?.[OAUTH_STATE_COOKIE];
    const options = stateCookieOptions();
    delete options.maxAge;
    response.clearCookie(OAUTH_STATE_COOKIE, options);
    if (!state || !cookieState || state.length !== cookieState.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState));
  }

  function readAccessUser(request) {
    const token = request.cookies?.[ACCESS_COOKIE];
    if (!token) {
      return null;
    }

    try {
      const payload = jwt.verify(token, accessSecret, { algorithms: ["HS256"] });
      return payload.user;
    } catch {
      return null;
    }
  }

  async function startSession(response, user) {
    const credential = createRefreshCredential();
    const expiresAt = refreshExpiry();
    await sessionStore.createSession({
      id: credential.id,
      familyId: credential.id,
      tokenHash: credential.tokenHash,
      user,
      expiresAt,
      familyExpiresAt: expiresAt
    });
    setAccessCookie(response, user);
    setRefreshCookie(response, credential.token, expiresAt);
  }

  async function refreshSession(request, response) {
    const current = parseRefreshCredential(request.cookies?.[REFRESH_COOKIE]);
    if (!current) {
      clearSessionCookies(response);
      return null;
    }

    const replacement = createReplacementCredential(current.token, accessSecret);
    const result = await sessionStore.rotateSession({
      id: current.id,
      tokenHash: current.tokenHash,
      replacement: {
        id: replacement.id,
        tokenHash: replacement.tokenHash
      }
    });

    if (result.status !== "rotated") {
      clearSessionCookies(response);
      return null;
    }

    setAccessCookie(response, result.user);
    setRefreshCookie(response, replacement.token, result.expiresAt);
    return result.user;
  }

  async function logout(request, response) {
    const credential = parseRefreshCredential(request.cookies?.[REFRESH_COOKIE]);
    try {
      if (credential) {
        await sessionStore.revokeSession(credential);
      }
    } finally {
      clearSessionCookies(response);
    }
  }

  function requireAuth(request, response, next) {
    const user = readAccessUser(request);
    if (!user) {
      response.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    request.user = user;
    next();
  }

  return {
    clearSessionCookies,
    createOauthState,
    logout,
    readAccessUser,
    refreshSession,
    requireAuth,
    startSession,
    verifyOauthState
  };
}

function createRefreshCredential() {
  const id = crypto.randomUUID();
  const token = `${id}.${crypto.randomBytes(32).toString("base64url")}`;
  return {
    id,
    token,
    tokenHash: hashToken(token)
  };
}

function parseRefreshCredential(token) {
  if (typeof token !== "string") {
    return null;
  }

  const separator = token.indexOf(".");
  const id = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (
    separator < 0
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    || !/^[A-Za-z0-9_-]{43}$/.test(secret)
  ) {
    return null;
  }

  return { id, token, tokenHash: hashToken(token) };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function refreshExpiry() {
  return new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
}

function createReplacementCredential(currentToken, secret) {
  const digest = crypto.createHmac("sha512", secret)
    .update("refresh-token-rotation\0")
    .update(currentToken)
    .digest();
  const idBytes = Buffer.from(digest.subarray(0, 16));
  idBytes[6] = (idBytes[6] & 0x0f) | 0x40;
  idBytes[8] = (idBytes[8] & 0x3f) | 0x80;
  const hex = idBytes.toString("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const token = `${id}.${digest.subarray(16, 48).toString("base64url")}`;
  return { id, token, tokenHash: hashToken(token) };
}
