import "dotenv/config";
import { createDatabasePool } from "../src/database.js";
import { runDatabaseMigrations } from "../src/migrations.js";

const pool = createDatabasePool(process.env.DATABASE_URL);

try {
  await runDatabaseMigrations(pool);
} finally {
  await pool.end();
}
