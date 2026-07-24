import pg from "pg";

const { Pool } = pg;
export const RELAYHUB_RUNTIME_DATABASE_ROLE = "relayhub_sms_runtime";

declare global {
  var relayhubPool: pg.Pool | undefined;
}

export function assertDedicatedRuntimeDatabaseRole(connectionString: string) {
  let username: string;

  try {
    username = decodeURIComponent(new URL(connectionString).username);
  } catch {
    throw new Error("DATABASE_URL is invalid");
  }

  if (username !== RELAYHUB_RUNTIME_DATABASE_ROLE) {
    throw new Error(
      `DATABASE_URL must use the dedicated ${RELAYHUB_RUNTIME_DATABASE_ROLE} role`,
    );
  }
}

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  assertDedicatedRuntimeDatabaseRole(connectionString);
  if (!globalThis.relayhubPool) {
    globalThis.relayhubPool = new Pool({ connectionString });
  }
  return globalThis.relayhubPool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
