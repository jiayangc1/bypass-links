import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createApp } from "../src/server.js";

test("rejects webhook requests with an invalid secret", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/telegram/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "wrong"
      },
      body: JSON.stringify({ message: { chat: { id: 1 }, text: "example.com" } })
    });

    assert.equal(response.status, 401);
  } finally {
    await close();
  }
});

test("accepts webhook requests with the configured secret", async () => {
  const { baseUrl, close, sentMessages } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/telegram/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "secret"
      },
      body: JSON.stringify({ message: { chat: { id: 1 }, text: "example.com" } })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });

    await waitFor(() => sentMessages.length === 1);
    assert.equal(sentMessages[0].chatId, 1);
  } finally {
    await close();
  }
});

test("request logging excludes OAuth query parameters", async () => {
  const logs = [];
  const { baseUrl, close } = await startServer({ logger: createTestLogger(logs) });
  try {
    await fetch(`${baseUrl}/oauth/callback?code=super-secret-code&state=secret-state`, { redirect: "manual" });
    const serialized = JSON.stringify(logs);
    assert.equal(serialized.includes("super-secret-code"), false);
    assert.equal(serialized.includes("secret-state"), false);
    assert.equal(logs.find((entry) => entry.event === "request_started")?.path, "/oauth/callback");
  } finally {
    await close();
  }
});

async function startServer(options = {}) {
  const sentMessages = [];
  const app = createApp({
    telegramWebhookSecret: "secret",
    bypassClient: {
      bypass: async () => "https://download.example/file"
    },
    telegramClient: {
      sendMessage: async (message) => {
        sentMessages.push(message);
      }
    },
    logger: options.logger
  });

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    baseUrl: `http://${address.address}:${address.port}`,
    sentMessages,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

function createTestLogger(logs) {
  const write = (level, event, details = {}) => logs.push({ level, event, ...details });
  return {
    info: (event, details) => write("info", event, details),
    warn: (event, details) => write("warn", event, details),
    error: (event, details) => write("error", event, details)
  };
}

async function waitFor(predicate) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 500) {
      throw new Error("Timed out waiting for predicate");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
