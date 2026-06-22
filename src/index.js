import "dotenv/config";
import { createBypassClient } from "./bypassClient.js";
import { readConfig, validateConfig } from "./config.js";
import { createDatabasePool } from "./database.js";
import { createLogger } from "./logger.js";
import { RateLimitQueue } from "./rateLimitQueue.js";
import { createApp } from "./server.js";
import { PostgresRefreshSessionStore } from "./sessionStore.js";
import { createTelegramClient } from "./telegramClient.js";

async function main() {
  const logger = createLogger("startup");
  const config = readConfig();
  validateConfig(config);
  const databasePool = createDatabasePool(config.databaseUrl);

  logger.info("config_loaded", {
    port: config.port,
    webhookBaseUrl: config.webhookBaseUrl,
    skipTelegramWebhook: config.skipTelegramWebhook,
    telegramBotTokenConfigured: Boolean(config.telegramBotToken),
    telegramWebhookSecretConfigured: Boolean(config.telegramWebhookSecret),
    bypassApiKeyConfigured: Boolean(config.bypassApiKey),
    bypassApiAuthHeader: config.bypassApiAuthHeader,
    bypassMaxHops: config.bypassMaxHops
  });

  const telegramClient = createTelegramClient({
    botToken: config.telegramBotToken,
    logger: createLogger("telegram"),
    maxRetries: config.outboundMaxRetries,
    timeoutMs: config.outboundTimeoutMs
  });
  const bypassClient = createBypassClient({
    apiKey: config.bypassApiKey,
    authHeader: config.bypassApiAuthHeader,
    maxRetries: config.outboundMaxRetries,
    maxHops: config.bypassMaxHops,
    logger: createLogger("bypass"),
    queue: new RateLimitQueue({ limit: 25, intervalMs: 10_000, concurrency: 2 }),
    timeoutMs: config.outboundTimeoutMs
  });

  const webhookUrl = new URL("/telegram/webhook", config.webhookBaseUrl).toString();
  if (config.skipTelegramWebhook) {
    logger.warn("telegram_webhook_registration_skipped", { webhookUrl });
  } else {
    logger.info("telegram_webhook_registration_started", { webhookUrl });
    await telegramClient.setWebhook({
      url: webhookUrl,
      secretToken: config.telegramWebhookSecret
    });
    logger.info("telegram_webhook_registered", { webhookUrl });
  }

  const app = createApp({
    telegramWebhookSecret: config.telegramWebhookSecret,
    telegramClient,
    bypassClient,
    sessionStore: new PostgresRefreshSessionStore(databasePool),
    discordErrorWebhookUrl: config.discordErrorWebhookUrl,
    logger: createLogger("server"),
    authConfig: {
      hackClubClientId: config.hackClubClientId,
      hackClubClientSecret: config.hackClubClientSecret,
      hackClubRedirectUri: config.hackClubRedirectUri,
      jwtAccessSecret: config.jwtAccessSecret,
      outboundMaxRetries: config.outboundMaxRetries,
      outboundTimeoutMs: config.outboundTimeoutMs,
      isProduction: process.env.NODE_ENV === "production"
    }
  });

  app.listen(config.port, () => {
    logger.info("server_listening", { port: config.port });
  });
}

main().catch((error) => {
  createLogger("startup").error("startup_failed", { error });
  process.exitCode = 1;
});
