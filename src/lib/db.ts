import pg from "pg";

const { Pool } = pg;

declare global {
  var relayhubPool: pg.Pool | undefined;
}

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
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
