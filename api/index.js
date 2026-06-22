import { createBypassClient } from "../src/bypassClient.js";
import { readConfig, validateConfig } from "../src/config.js";
import { createDatabasePool } from "../src/database.js";
import { RateLimitQueue } from "../src/rateLimitQueue.js";
import { createApp } from "../src/server.js";
import { PostgresRefreshSessionStore } from "../src/sessionStore.js";
import { createTelegramClient } from "../src/telegramClient.js";

const config = readConfig();
validateConfig(config);
const databasePool = createDatabasePool(config.databaseUrl);

const telegramClient = createTelegramClient({
  botToken: config.telegramBotToken,
  maxRetries: config.outboundMaxRetries,
  timeoutMs: config.outboundTimeoutMs
});

const bypassClient = createBypassClient({
  apiKey: config.bypassApiKey,
  authHeader: config.bypassApiAuthHeader,
  maxRetries: config.outboundMaxRetries,
  maxHops: config.bypassMaxHops,
  queue: new RateLimitQueue({ limit: 25, intervalMs: 10_000, concurrency: 2 }),
  timeoutMs: config.outboundTimeoutMs
});

export default createApp({
  telegramWebhookSecret: config.telegramWebhookSecret,
  telegramClient,
  bypassClient,
  sessionStore: new PostgresRefreshSessionStore(databasePool),
  discordErrorWebhookUrl: config.discordErrorWebhookUrl,
  authConfig: {
    hackClubClientId: config.hackClubClientId,
    hackClubClientSecret: config.hackClubClientSecret,
    hackClubRedirectUri: config.hackClubRedirectUri,
    jwtAccessSecret: config.jwtAccessSecret,
    outboundMaxRetries: config.outboundMaxRetries,
    outboundTimeoutMs: config.outboundTimeoutMs,
    isProduction: true
  },
  serveClient: false
});
