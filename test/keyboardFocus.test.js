import assert from "node:assert/strict";
import test from "node:test";
import { shouldFocusBypassInput } from "../client/src/keyboardFocus.js";

function keyboardEvent(overrides = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    key: "h",
    metaKey: false,
    target: null,
    ...overrides
  };
}

test("ordinary typing focuses the bypass input", () => {
  assert.equal(shouldFocusBypassInput(keyboardEvent({ key: "h" })), true);
  assert.equal(shouldFocusBypassInput(keyboardEvent({ key: "/" })), true);
});

test("paste shortcuts focus the bypass input", () => {
  assert.equal(shouldFocusBypassInput(keyboardEvent({ ctrlKey: true, key: "v" })), true);
  assert.equal(shouldFocusBypassInput(keyboardEvent({ metaKey: true, key: "v" })), true);
});

test("browser and modified shortcuts keep their normal behavior", () => {
  assert.equal(shouldFocusBypassInput(keyboardEvent({ ctrlKey: true, key: "w" })), false);
  assert.equal(shouldFocusBypassInput(keyboardEvent({ metaKey: true, key: "l" })), false);
  assert.equal(shouldFocusBypassInput(keyboardEvent({ altKey: true, key: "ArrowLeft" })), false);
  assert.equal(shouldFocusBypassInput(keyboardEvent({ key: "Control" })), false);
});
