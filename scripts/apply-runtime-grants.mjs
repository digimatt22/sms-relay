import pg from "pg";

const OWNER_MIGRATOR_ROLE = "relayhub_sms_owner";
const RUNTIME_ROLE = "relayhub_sms_runtime";
const databaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL is required");
}
const migrationRole = decodeURIComponent(new URL(databaseUrl).username);
if (migrationRole !== OWNER_MIGRATOR_ROLE) {
  throw new Error(`MIGRATION_DATABASE_URL must use ${OWNER_MIGRATOR_ROLE}`);
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 5_000,
});

try {
  await pool.query("BEGIN");
  await pool.query("REVOKE ALL ON DATABASE relayhub_sms FROM PUBLIC");
  await pool.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  await pool.query(`GRANT CONNECT ON DATABASE relayhub_sms TO ${RUNTIME_ROLE}`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${RUNTIME_ROLE}`);
  await pool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${RUNTIME_ROLE}`,
  );
  await pool.query(
    `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${RUNTIME_ROLE}`,
  );
  await pool.query(`
    ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER_MIGRATOR_ROLE} IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${RUNTIME_ROLE}
  `);
  await pool.query(`
    ALTER DEFAULT PRIVILEGES FOR ROLE ${OWNER_MIGRATOR_ROLE} IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${RUNTIME_ROLE}
  `);
  await pool.query("COMMIT");
} catch (error) {
  await pool.query("ROLLBACK");
  throw error;
} finally {
  await pool.end();
}
