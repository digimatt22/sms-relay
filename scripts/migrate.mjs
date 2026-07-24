import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const OWNER_MIGRATOR_ROLE = "relayhub_sms_owner";
const databaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!databaseUrl) {
  console.error("MIGRATION_DATABASE_URL is required");
  process.exit(1);
}

let migrationRole;
try {
  migrationRole = decodeURIComponent(new URL(databaseUrl).username);
} catch {
  console.error("MIGRATION_DATABASE_URL is invalid");
  process.exit(1);
}
if (migrationRole !== OWNER_MIGRATOR_ROLE) {
  console.error(`MIGRATION_DATABASE_URL must use ${OWNER_MIGRATOR_ROLE}`);
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});
const migrationsDir = path.join(process.cwd(), "migrations");

try {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const file of files) {
    const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [file]);
    if (applied.rowCount) continue;

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await pool.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await pool.end();
}
