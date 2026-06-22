import assert from "node:assert/strict";
import test from "node:test";
import { describeBypassError, getDestination } from "../client/src/resultUtils.js";

test("describes destination URLs without exposing credentials", () => {
  assert.deepEqual(getDestination("https://downloads.example.com/file?q=1"), {
    hostname: "downloads.example.com",
    pathname: "/file?q=1"
  });
  assert.equal(getDestination("paste content"), null);
});

test("maps API error codes to actionable messages", () => {
  assert.match(describeBypassError({ response: { data: { error: "unsupported_link" } } }).message, /not supported/i);
  assert.match(describeBypassError({ response: { data: { error: "rate_limited", retryAfter: 12 } } }).message, /12 seconds/i);
  assert.match(describeBypassError({ response: { data: { error: "unauthorized" } } }).message, /sign in again/i);
  assert.match(describeBypassError({ response: { data: { error: "upstream_timeout" } } }).message, /too long/i);
});
