import assert from "node:assert/strict";
import test from "node:test";
import { API_TIMEOUT_MS } from "../client/src/api.js";
import { DEFAULT_BYPASS_OPERATION_TIMEOUT_MS } from "../src/bypassClient.js";

test("the browser deadline allows the server to return its timeout response", () => {
  assert.ok(API_TIMEOUT_MS > DEFAULT_BYPASS_OPERATION_TIMEOUT_MS);
});
