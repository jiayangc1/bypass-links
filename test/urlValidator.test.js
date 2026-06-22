import assert from "node:assert/strict";
import test from "node:test";
import { InvalidUrlError } from "../src/errors.js";
import { isPublicHttpUrl, parsePublicHttpUrl, resolvePublicHttpUrl } from "../src/urlValidator.js";

test("accepts and canonicalizes public HTTP URLs", () => {
  assert.equal(parsePublicHttpUrl("https://example.com/path#fragment").toString(), "https://example.com/path#fragment");
  assert.equal(isPublicHttpUrl("http://example.com"), true);
});

for (const value of [
  "http://",
  "file:///tmp/file",
  "https://user:password@example.com",
  "http://localhost/path",
  "http://service.internal/path",
  "http://127.0.0.1/path",
  "http://10.0.0.1/path",
  "http://169.254.169.254/latest/meta-data",
  "http://[::1]/path",
  "http://[fc00::1]/path",
  "https://example.com:8443/path"
]) {
  test(`rejects unsafe URL: ${value}`, () => {
    assert.throws(() => parsePublicHttpUrl(value), InvalidUrlError);
  });
}

test("accepts hostnames only when every resolved address is public", async () => {
  const resolved = await resolvePublicHttpUrl("https://example.com/path", {
    lookupImpl: async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }
    ]
  });
  assert.equal(resolved.toString(), "https://example.com/path");
});

for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "fc00::1"]) {
  test(`rejects a public-looking hostname resolving to ${address}`, async () => {
    await assert.rejects(
      resolvePublicHttpUrl("https://attacker.example/path", {
        lookupImpl: async () => [{ address }]
      }),
      InvalidUrlError
    );
  });
}
