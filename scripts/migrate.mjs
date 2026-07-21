import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
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
