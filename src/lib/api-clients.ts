import { query, transaction } from "@/lib/db";
import { DEFAULT_ORGANIZATION_ID, ensureDefaultGatewayPool } from "@/lib/organizations";
import { apiKeyPrefix, createClientKey, hashApiKey } from "@/lib/security";

export async function createApiClient(input: { name: string; keyLabel?: string; userId?: string | null; organizationId?: string }) {
  const apiKey = createClientKey();
  const hashedKey = hashApiKey(apiKey);
  const prefix = apiKeyPrefix(apiKey);
  const organizationId = input.organizationId || DEFAULT_ORGANIZATION_ID;
  const defaultGatewayPoolId = await ensureDefaultGatewayPool(organizationId);

  const client = await transaction(async (db) => {
    const result = await db.query(
      `INSERT INTO api_clients (
         name, organization_id, api_key_hash, api_key_prefix, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, api_key_prefix, status, created_at`,
      [input.name, organizationId, hashedKey, prefix, input.userId || null]
    );
    const created = result.rows[0];

    await db.query(
      `INSERT INTO api_client_keys (
         api_client_id, api_key_hash, api_key_prefix, label, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [created.id, hashedKey, prefix, input.keyLabel || "Production", input.userId || null]
    );
    await db.query(
      `INSERT INTO api_client_gateway_pool_access (api_client_id, gateway_pool_id, is_default)
       VALUES ($1, $2, true)
       ON CONFLICT (api_client_id, gateway_pool_id) DO UPDATE
         SET is_default = EXCLUDED.is_default`,
      [created.id, defaultGatewayPoolId]
    );

    return created;
  });

  return { client, apiKey };
}

export async function listApiClients(options: { organizationId?: string } = {}) {
  const values: unknown[] = [];
  let where = "";
  if (options.organizationId) {
    values.push(options.organizationId);
    where = `WHERE c.organization_id = $${values.length}`;
  }
  const result = await query(
    `SELECT c.id, c.name, c.api_key_prefix, c.status, c.last_used_at, c.created_at,
            c.disabled_at,
            c.hourly_message_limit,
            c.daily_message_limit,
            COUNT(k.id)::int AS key_count,
            COUNT(k.id) FILTER (WHERE k.status = 'active')::int AS active_key_count,
            COUNT(DISTINCT m.id)::int AS total_messages,
            COUNT(DISTINCT m.id) FILTER (WHERE m.created_at >= now() - interval '24 hours')::int AS messages_24h,
            COUNT(DISTINCT m.id) FILTER (WHERE m.status IN ('carrier_submitted', 'delivery_confirmed', 'delivery_failed', 'delivery_unknown'))::int AS submitted_messages,
            COUNT(DISTINCT m.id) FILTER (WHERE m.status IN ('retry_scheduled', 'failed', 'dead_lettered'))::int AS problem_messages
       FROM api_clients c
       LEFT JOIN api_client_keys k ON k.api_client_id = c.id
       LEFT JOIN messages m ON m.api_client_id = c.id
      ${where}
      GROUP BY c.id
      ORDER BY c.created_at DESC`,
    values
  );
  return result.rows;
}

export async function rotateApiClientKey(input: { clientId: string; userId?: string | null; organizationId?: string }) {
  const apiKey = createClientKey();
  const hashedKey = hashApiKey(apiKey);
  const prefix = apiKeyPrefix(apiKey);

  const client = await transaction(async (db) => {
    const result = await db.query(
      `UPDATE api_clients
          SET api_key_hash = $1,
              api_key_prefix = $2,
              updated_at = now()
        WHERE id = $3
          AND ($4::uuid IS NULL OR organization_id = $4::uuid)
          AND disabled_at IS NULL
        RETURNING id, name, api_key_prefix`,
      [hashedKey, prefix, input.clientId, input.organizationId || null]
    );
    const updated = result.rows[0];
    if (!updated) return null;

    await db.query(
      `UPDATE api_client_keys
          SET status = 'revoked', revoked_at = now(), updated_at = now()
        WHERE api_client_id = $1
          AND status = 'active'`,
      [input.clientId]
    );
    await db.query(
      `INSERT INTO api_client_keys (
         api_client_id, api_key_hash, api_key_prefix, label, created_by_user_id
       )
       VALUES ($1, $2, $3, 'Rotated key', $4)`,
      [input.clientId, hashedKey, prefix, input.userId || null]
    );

    return updated;
  });

  return client ? { client, apiKey } : null;
}

export async function createApiClientKey(input: {
  clientId: string;
  label: string;
  userId?: string | null;
  organizationId?: string;
}) {
  const apiKey = createClientKey();
  const hashedKey = hashApiKey(apiKey);
  const prefix = apiKeyPrefix(apiKey);

  const result = await query(
    `INSERT INTO api_client_keys (
       api_client_id, api_key_hash, api_key_prefix, label, created_by_user_id
     )
     SELECT c.id, $1, $2, $3, $4
       FROM api_clients c
      WHERE c.id = $5
        AND c.disabled_at IS NULL
        AND ($6::uuid IS NULL OR c.organization_id = $6::uuid)
      RETURNING api_client_id, api_key_prefix`,
    [
      hashedKey,
      prefix,
      input.label,
      input.userId || null,
      input.clientId,
      input.organizationId || null
    ]
  );

  return result.rows[0] ? { apiKey, prefix } : null;
}

export async function disableApiClient(clientId: string, options: { organizationId?: string } = {}) {
  const result = await transaction(async (db) => {
    const client = await db.query(
      `UPDATE api_clients
          SET status = 'disabled',
              disabled_at = COALESCE(disabled_at, now()),
              updated_at = now()
        WHERE id = $1
          AND ($2::uuid IS NULL OR organization_id = $2::uuid)
        RETURNING id`,
      [clientId, options.organizationId || null]
    );
    if (!client.rows[0]) return null;
    await db.query(
      `UPDATE api_client_keys
          SET status = 'revoked',
              revoked_at = COALESCE(revoked_at, now()),
              updated_at = now()
        WHERE api_client_id = $1
          AND status = 'active'`,
      [clientId]
    );
    return client.rows[0];
  });
  return result;
}

export async function enableApiClient(clientId: string, options: { organizationId?: string } = {}) {
  const result = await query(
    `UPDATE api_clients
        SET status = 'active',
            disabled_at = NULL,
            updated_at = now()
      WHERE id = $1
        AND ($2::uuid IS NULL OR organization_id = $2::uuid)
      RETURNING id`,
    [clientId, options.organizationId || null]
  );
  return result.rows[0] || null;
}

export async function updateApiClientLimits(input: {
  clientId: string;
  organizationId?: string;
  hourlyMessageLimit?: number | null;
  dailyMessageLimit?: number | null;
}) {
  const result = await query(
    `UPDATE api_clients
        SET hourly_message_limit = $1,
            daily_message_limit = $2,
            updated_at = now()
      WHERE id = $3
        AND ($4::uuid IS NULL OR organization_id = $4::uuid)
      RETURNING id`,
    [
      input.hourlyMessageLimit || null,
      input.dailyMessageLimit || null,
      input.clientId,
      input.organizationId || null
    ]
  );
  return result.rows[0] || null;
}

export async function getClientUsageSummary(options: { organizationId?: string } = {}) {
  const values: unknown[] = [];
  let where = "";
  if (options.organizationId) {
    values.push(options.organizationId);
    where = `WHERE m.organization_id = $${values.length}`;
  }
  const result = await query(
    `SELECT COALESCE(c.name, 'Dashboard') AS source,
            COALESCE(c.id::text, 'dashboard') AS source_id,
            COUNT(m.id)::int AS total_messages,
            COUNT(m.id) FILTER (WHERE m.created_at >= now() - interval '1 hour')::int AS messages_1h,
            COUNT(m.id) FILTER (WHERE m.created_at >= now() - interval '24 hours')::int AS messages_24h,
            COUNT(m.id) FILTER (WHERE m.status IN ('carrier_submitted', 'delivery_confirmed', 'delivery_failed', 'delivery_unknown'))::int AS submitted_messages,
            COUNT(m.id) FILTER (WHERE m.status IN ('retry_scheduled', 'failed', 'dead_lettered'))::int AS problem_messages
       FROM messages m
       LEFT JOIN api_clients c ON c.id = m.api_client_id
      ${where}
      GROUP BY c.id, c.name
      ORDER BY total_messages DESC`,
    values
  );
  return result.rows;
}

export async function authenticateApiClient(key: string) {
  if (!key) return null;
  return transaction(async (db) => {
    const result = await db.query(
      `SELECT c.id, c.name, c.organization_id, c.api_key_prefix, c.status, k.id AS key_id
         FROM api_client_keys k
         JOIN api_clients c ON c.id = k.api_client_id
        WHERE k.api_key_hash = $1
          AND k.status = 'active'
          AND c.status = 'active'
          AND c.disabled_at IS NULL`,
      [hashApiKey(key)]
    );
    const client = result.rows[0];
    if (!client) return null;

    await db.query(
      `UPDATE api_client_keys
          SET last_used_at = now(), updated_at = now()
        WHERE id = $1`,
      [client.key_id]
    );
    await db.query(
      `UPDATE api_clients
          SET last_used_at = now(), updated_at = now()
        WHERE id = $1`,
      [client.id]
    );

    return {
      id: client.id,
      name: client.name,
      organization_id: client.organization_id,
      api_key_prefix: client.api_key_prefix,
      key_id: client.key_id,
      status: client.status
    };
  });
}
