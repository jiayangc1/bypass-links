import assert from "node:assert/strict";
import test from "node:test";
import { readConfig, validateConfig } from "../src/config.js";

const validEnvironment = {
  APP_ORIGIN: "https://app.example.com",
  AUTHOMETRY_CLIENT_ID: "authometry-client",
  AUTHOMETRY_CLIENT_SECRET: "authometry-secret",
  AUTHOMETRY_ISSUER: "https://authometry.example.com",
  BYPASS_API_KEY: "key",
  DATABASE_URL: "postgresql://localhost/bypass_links",
  HACK_CLUB_CLIENT_ID: "client",
  HACK_CLUB_CLIENT_SECRET: "secret",
  JWT_ACCESS_SECRET: "access-secret",
  TELEGRAM_BOT_TOKEN: "token",
  TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
  WEBHOOK_BASE_URL: "https://app.example.com"
};

test("production configuration requires PostgreSQL-backed sessions", () => {
  const config = readConfig({ ...validEnvironment, DATABASE_URL: "" });
  assert.throws(() => validateConfig(config), /DATABASE_URL/);
});

test("accepts bounded outbound timeout and retry configuration", () => {
  const config = readConfig({
    ...validEnvironment,
    OUTBOUND_MAX_RETRIES: "3",
    OUTBOUND_TIMEOUT_MS: "5000"
  });
  assert.doesNotThrow(() => validateConfig(config));
  assert.equal(config.outboundMaxRetries, 3);
  assert.equal(config.outboundTimeoutMs, 5_000);
});

test("rejects unbounded retry configuration", () => {
  const config = readConfig({ ...validEnvironment, OUTBOUND_MAX_RETRIES: "20" });
  assert.throws(() => validateConfig(config), /between 0 and 5/);
});
