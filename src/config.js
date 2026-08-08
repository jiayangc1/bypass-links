const DEFAULT_PORT = 3000;
const DEFAULT_BYPASS_MAX_HOPS = 5;
const DEFAULT_APP_ORIGIN = "http://localhost:3000";
const DEFAULT_OUTBOUND_TIMEOUT_MS = 8_000;
const DEFAULT_OUTBOUND_MAX_RETRIES = 2;

export function readConfig(env = process.env) {
  const appOrigin = env.APP_ORIGIN || env.WEBHOOK_BASE_URL || DEFAULT_APP_ORIGIN;

  return {
    port: Number(env.PORT || DEFAULT_PORT),
    appOrigin,
    databaseUrl: env.DATABASE_URL,
    webhookBaseUrl: env.WEBHOOK_BASE_URL,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
    bypassApiKey: env.BYPASS_API_KEY,
    bypassApiAuthHeader: env.BYPASS_API_AUTH_HEADER || "Authorization",
    bypassMaxHops: Number(env.BYPASS_MAX_HOPS || DEFAULT_BYPASS_MAX_HOPS),
    outboundTimeoutMs: Number(env.OUTBOUND_TIMEOUT_MS || DEFAULT_OUTBOUND_TIMEOUT_MS),
    outboundMaxRetries: Number(env.OUTBOUND_MAX_RETRIES || DEFAULT_OUTBOUND_MAX_RETRIES),
    discordErrorWebhookUrl: env.DISCORD_ERROR_WEBHOOK_URL || "",
    skipTelegramWebhook: env.SKIP_TELEGRAM_WEBHOOK === "true",
    hackClubClientId: env.HACK_CLUB_CLIENT_ID,
    hackClubClientSecret: env.HACK_CLUB_CLIENT_SECRET,
    hackClubRedirectUri: env.HACK_CLUB_REDIRECT_URI || new URL("/oauth/callback", appOrigin).toString(),
    authometryIssuer: env.AUTHOMETRY_ISSUER,
    authometryClientId: env.AUTHOMETRY_CLIENT_ID,
    authometryClientSecret: env.AUTHOMETRY_CLIENT_SECRET,
    authometryRedirectUri: new URL("/auth/authometry/callback", appOrigin).toString(),
    jwtAccessSecret: env.JWT_ACCESS_SECRET
  };
}

export function validateConfig(config) {
  const required = [
    ["WEBHOOK_BASE_URL", config.webhookBaseUrl],
    ["TELEGRAM_BOT_TOKEN", config.telegramBotToken],
    ["TELEGRAM_WEBHOOK_SECRET", config.telegramWebhookSecret],
    ["BYPASS_API_KEY", config.bypassApiKey],
    ["BYPASS_API_AUTH_HEADER", config.bypassApiAuthHeader],
    ["HACK_CLUB_CLIENT_ID", config.hackClubClientId],
    ["HACK_CLUB_CLIENT_SECRET", config.hackClubClientSecret],
    ["HACK_CLUB_REDIRECT_URI", config.hackClubRedirectUri],
    ["AUTHOMETRY_ISSUER", config.authometryIssuer],
    ["AUTHOMETRY_CLIENT_ID", config.authometryClientId],
    ["AUTHOMETRY_CLIENT_SECRET", config.authometryClientSecret],
    ["JWT_ACCESS_SECRET", config.jwtAccessSecret],
    ["DATABASE_URL", config.databaseUrl],
    ["APP_ORIGIN", config.appOrigin]
  ];

  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  if (!Number.isInteger(config.port) || config.port <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  if (!Number.isInteger(config.bypassMaxHops) || config.bypassMaxHops <= 0) {
    throw new Error("BYPASS_MAX_HOPS must be a positive integer");
  }

  if (!Number.isInteger(config.outboundTimeoutMs) || config.outboundTimeoutMs <= 0) {
    throw new Error("OUTBOUND_TIMEOUT_MS must be a positive integer");
  }

  if (!Number.isInteger(config.outboundMaxRetries) || config.outboundMaxRetries < 0 || config.outboundMaxRetries > 5) {
    throw new Error("OUTBOUND_MAX_RETRIES must be an integer between 0 and 5");
  }

  for (const [name, value] of [
    ["APP_ORIGIN", config.appOrigin],
    ["WEBHOOK_BASE_URL", config.webhookBaseUrl],
    ["HACK_CLUB_REDIRECT_URI", config.hackClubRedirectUri],
    ["AUTHOMETRY_ISSUER", config.authometryIssuer],
    ["AUTHOMETRY_REDIRECT_URI", config.authometryRedirectUri]
  ]) {
    try {
      new URL(value);
    } catch {
      throw new Error(`${name} must be a valid URL`);
    }
  }
}
