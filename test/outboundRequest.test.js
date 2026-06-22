import assert from "node:assert/strict";
import test from "node:test";
import { UpstreamTimeoutError } from "../src/errors.js";
import { requestWithPolicy } from "../src/outboundRequest.js";

test("retries idempotent requests up to the configured bound", async () => {
  let calls = 0;
  const response = await requestWithPolicy(async () => {
    calls += 1;
    return { status: calls < 3 ? 503 : 200 };
  }, "https://service.example/path", { method: "GET" }, {
    maxRetries: 2,
    sleepImpl: async () => {},
    timeoutMs: 100
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 3);
});

test("does not retry unsafe requests by default", async () => {
  let calls = 0;
  const response = await requestWithPolicy(async () => {
    calls += 1;
    return { status: 503 };
  }, "https://service.example/path", { method: "POST" }, {
    maxRetries: 2,
    sleepImpl: async () => {},
    timeoutMs: 100
  });

  assert.equal(response.status, 503);
  assert.equal(calls, 1);
});

test("converts an exhausted request timeout into a typed timeout error", async () => {
  await assert.rejects(
    requestWithPolicy((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }), "https://service.example/path", {}, {
      maxRetries: 0,
      timeoutMs: 5
    }),
    UpstreamTimeoutError
  );
});
