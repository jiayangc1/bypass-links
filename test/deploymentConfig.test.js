import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("production builds apply database migrations before compiling the client", async () => {
  const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(packageJson.scripts.build, /^npm run db:migrate && /);
});
