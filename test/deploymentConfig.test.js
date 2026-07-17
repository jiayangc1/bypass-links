import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("production builds stay database-independent and initialize migrations at runtime", async () => {
  const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  const apiEntry = await fs.readFile(new URL("../api/index.js", import.meta.url), "utf8");

  assert.equal(packageJson.scripts.build, "vite build");
  assert.match(apiEntry, /prepare: \(\) => runDatabaseMigrations\(databasePool\)/);
});
