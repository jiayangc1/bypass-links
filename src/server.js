import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createAuthService, normalizeHackClubUser } from "./auth.js";
import { createAuthometryOAuthClient, safeReturnPath } from "./authometryOAuth.js";
import { notifyDiscord, processTelegramUpdate } from "./bot.js";
import { createLogger, serializeError } from "./logger.js";
import { createHackClubOAuthClient } from "./oauthClient.js";
import { InMemoryOAuthAttemptStore } from "./oauthAttemptStore.js";
import { PublicHttpError, UpstreamUnavailableError } from "./errors.js";
import { parsePublicHttpUrl } from "./urlValidator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLIENT_DIST = path.resolve(__dirname, "../dist/client");

export function createApp({
  telegramWebhookSecret,
  telegramClient,
  bypassClient,
  discordErrorWebhookUrl = "",
  fetchImpl = fetch,
  authConfig = {},
  oauthClient,
  authometryClient,
  oauthAttemptStore = new InMemoryOAuthAttemptStore(),
  sessionStore,
  clientDistPath = DEFAULT_CLIENT_DIST,
  serveClient = true,
  logger = createLogger("server")
}) {
  const app = express();
  const auth = createAuthService({
    accessSecret: authConfig.jwtAccessSecret || "test-access-secret",
    isProduction: authConfig.isProduction,
    sessionStore
  });
  const hackClubOAuth = oauthClient || createHackClubOAuthClient({
    clientId: authConfig.hackClubClientId || "test-client-id",
    clientSecret: authConfig.hackClubClientSecret || "test-client-secret",
    redirectUri: authConfig.hackClubRedirectUri || "http://localhost:3000/oauth/callback",
    fetchImpl,
    maxRetries: authConfig.outboundMaxRetries,
    timeoutMs: authConfig.outboundTimeoutMs
  });
  const authometryOAuth = authometryClient || createAuthometryOAuthClient({
    issuer: authConfig.authometryIssuer || "https://authometry.ch3n.cc",
    clientId: authConfig.authometryClientId || "test-authometry-client-id",
    clientSecret: authConfig.authometryClientSecret || "test-authometry-client-secret",
    redirectUri: authConfig.authometryRedirectUri || "http://localhost:3000/auth/authometry/callback",
    fetchImpl,
    timeoutMs: authConfig.outboundTimeoutMs
  });
  const bypassLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, response, _next, options) => {
      const retryAfter = Math.ceil(options.windowMs / 1_000);
      response.status(429).json({ ok: false, error: "rate_limited", retryAfter });
    }
  });

  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use((request, response, next) => {
    const startedAt = Date.now();
    logger.info("request_started", {
      method: request.method,
      path: request.path,
      ip: request.ip
    });
    response.on("finish", () => {
      logger.info("request_finished", {
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt
      });
    });
    next();
  });

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/auth/hackclub", (request, response) => {
    const state = auth.createOauthState(response);
    response.redirect(hackClubOAuth.buildAuthorizationUrl(state));
  });

  app.get("/auth/authometry", async (request, response, next) => {
    try {
      const attempt = await authometryOAuth.createAuthorizationAttempt(safeReturnPath(request.query.returnTo));
      await oauthAttemptStore.createAttempt(attempt);
      response.redirect(attempt.authorizationUrl.toString());
    } catch (error) {
      next(new UpstreamUnavailableError("Authometry sign-in is temporarily unavailable.", error));
    }
  });

  app.get("/auth/authometry/callback", async (request, response, next) => {
    const state = typeof request.query.state === "string" ? request.query.state : "";
    try {
      const attempt = state ? await oauthAttemptStore.consumeAttempt(state) : null;
      if (!attempt) {
        response.status(400).send("Invalid or expired Authometry OAuth state.");
        return;
      }
      if (typeof request.query.error === "string") {
        response.status(400).send("Authometry sign-in was not completed.");
        return;
      }
      if (typeof request.query.code !== "string") {
        response.status(400).send("Invalid Authometry OAuth callback.");
        return;
      }

      const user = await authometryOAuth.completeAuthorization(request.query, attempt);
      await auth.replaceSession(request, response, user);
      response.redirect(attempt.returnTo);
    } catch (error) {
      next(new UpstreamUnavailableError("Authometry sign-in could not be completed.", error));
    }
  });

  app.get("/oauth/callback", async (request, response, next) => {
    try {
      const { code, state } = request.query;
      if (typeof code !== "string" || !auth.verifyOauthState(request, response, String(state || ""))) {
        response.status(400).send("Invalid Hack Club OAuth callback.");
        return;
      }

      const tokenPayload = await hackClubOAuth.exchangeCodeForToken(code);
      const profilePayload = await hackClubOAuth.fetchMe(tokenPayload.access_token);
      const user = normalizeHackClubUser(profilePayload);
      if (!user.id || !user.email) {
        response.status(502).send("Hack Club profile response was missing required identity fields.");
        return;
      }

      await auth.startSession(response, user);
      response.redirect("/");
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/me", (request, response) => {
    const user = auth.readAccessUser(request);
    if (!user) {
      response.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    response.json({ ok: true, user });
  });

  app.get("/api/session", async (request, response, next) => {
    const accessUser = auth.readAccessUser(request);
    if (accessUser) {
      response.json({ ok: true, user: accessUser });
      return;
    }

    try {
      const refreshUser = await auth.refreshSession(request, response);
      response.json({ ok: true, user: refreshUser });
    } catch (error) {
      next(error);
    }
  });

  app.post("/auth/refresh", async (request, response, next) => {
    try {
      const user = await auth.refreshSession(request, response);
      if (!user) {
        response.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }

      response.json({ ok: true, user });
    } catch (error) {
      next(error);
    }
  });

  app.post("/auth/logout", async (request, response, next) => {
    try {
      await auth.logout(request, response);
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/bypass", bypassLimiter, auth.requireAuth, async (request, response, next) => {
    try {
      const { refresh = false, url } = request.body || {};
      const validatedUrl = parsePublicHttpUrl(url).toString();

      const result = await bypassClient.bypass(validatedUrl, { refresh: refresh === true });
      response.json({ ok: true, result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/telegram/webhook", async (request, response) => {
    const secretToken = request.get("x-telegram-bot-api-secret-token");
    if (secretToken !== telegramWebhookSecret) {
      logger.warn("telegram_webhook_rejected", {
        reason: "invalid_secret",
        hasSecretToken: Boolean(secretToken),
        secretTokenLength: secretToken?.length || 0,
        updateId: request.body?.update_id
      });
      response.status(401).json({ ok: false, error: "invalid webhook secret" });
      return;
    }

    logger.info("telegram_webhook_accepted", {
      updateId: request.body?.update_id,
      hasMessage: Boolean(request.body?.message),
      hasEditedMessage: Boolean(request.body?.edited_message)
    });
    response.status(200).json({ ok: true });

    try {
      const result = await processTelegramUpdate(request.body, {
        bypassClient,
        telegramClient,
        logger
      });
      logger.info("telegram_update_processed", {
        updateId: request.body?.update_id,
        result
      });
    } catch (error) {
      logger.error("telegram_update_processing_failed", {
        updateId: request.body?.update_id,
        error: serializeError(error)
      });
      await notifyDiscord(discordErrorWebhookUrl, error, fetchImpl);
    }
  });

  if (serveClient) {
    app.use(express.static(clientDistPath));
    app.get("*", (_request, response, next) => {
      response.sendFile(path.join(clientDistPath, "index.html"), (error) => {
        if (error) {
          next();
        }
      });
    });
  }

  app.use((error, request, response, _next) => {
    const publicError = error instanceof PublicHttpError
      ? error
      : new PublicHttpError("An unexpected error occurred.");
    const logMethod = publicError.status >= 500 ? "error" : "warn";
    logger[logMethod]("request_error", {
      code: publicError.code,
      error: serializeError(error),
      path: request.path,
      statusCode: publicError.status
    });

    if (publicError.retryAfter !== null) {
      response.set("retry-after", String(publicError.retryAfter));
    }

    if (request.path === "/oauth/callback" || request.path === "/auth/authometry/callback") {
      response.status(publicError.status).send(publicError.message);
      return;
    }

    const payload = { ok: false, error: publicError.code };
    if (publicError.retryAfter !== null) {
      payload.retryAfter = publicError.retryAfter;
    }
    response.status(publicError.status).json(payload);
  });

  return app;
}
