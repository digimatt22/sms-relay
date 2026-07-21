import { query, transaction } from "@/lib/db";

export async function enableGateway(gatewayId: string, options: { organizationId?: string } = {}) {
  const values: unknown[] = [gatewayId];
  let scope = "";
  if (options.organizationId) {
    values.push(options.organizationId);
    scope = `AND organization_id = $${values.length}`;
  }
  const result = await query(
    `UPDATE gateways
        SET status = 'unknown',
            disabled_at = NULL,
            maintenance_at = NULL,
            updated_at = now()
      WHERE id = $1
        ${scope}
      RETURNING id`,
    values
  );
  return result.rows[0] || null;
}

export async function markGatewayMaintenance(gatewayId: string, options: { organizationId?: string } = {}) {
  const values: unknown[] = [gatewayId];
  let scope = "";
  if (options.organizationId) {
    values.push(options.organizationId);
    scope = `AND organization_id = $${values.length}`;
  }
  const result = await query(
    `UPDATE gateways
        SET status = 'maintenance',
            maintenance_at = now(),
            updated_at = now()
      WHERE id = $1
        ${scope}
        AND disabled_at IS NULL
      RETURNING id`,
    values
  );
  return result.rows[0] || null;
}

export async function requestGatewayCommand(input: {
  gatewayId: string;
  commandType: string;
  payload?: Record<string, unknown>;
  userId?: string | null;
  organizationId?: string;
}) {
  return transaction(async (client) => {
    const gateway = await client.query(
      `SELECT organization_id
        FROM gateways
       WHERE id = $1
          AND ($2::uuid IS NULL OR organization_id = $2::uuid)
          AND disabled_at IS NULL`,
      [input.gatewayId, input.organizationId || null]
    );
    const organizationId = gateway.rows[0]?.organization_id;
    if (!organizationId) return null;

    const result = await client.query(
      `INSERT INTO gateway_commands (
         organization_id, gateway_id, command_type, payload, requested_by_user_id
       )
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING *`,
      [
        organizationId,
        input.gatewayId,
        input.commandType,
        JSON.stringify(input.payload || {}),
        input.userId || null
      ]
    );
    return result.rows[0];
  });
}

export async function claimGatewayCommands(gatewayId: string, limit = 5) {
  const result = await query(
    `WITH due AS (
       SELECT id
         FROM gateway_commands
        WHERE gateway_id = $1
          AND status = 'pending'
        ORDER BY requested_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $2
     )
     UPDATE gateway_commands c
        SET status = 'claimed',
            claimed_at = now(),
            updated_at = now()
       FROM due
      WHERE c.id = due.id
      RETURNING c.id, c.command_type, c.payload, c.requested_at`,
    [gatewayId, limit]
  );
  return result.rows;
}

export async function completeGatewayCommand(input: {
  gatewayId: string;
  commandId: string;
  status: "completed" | "failed";
  result?: Record<string, unknown>;
}) {
  const result = await query(
    `UPDATE gateway_commands
        SET status = $1,
            result = $2::jsonb,
            completed_at = now(),
            updated_at = now()
      WHERE id = $3
        AND gateway_id = $4
        AND status = 'claimed'
      RETURNING *`,
    [input.status, JSON.stringify(input.result || {}), input.commandId, input.gatewayId]
  );
  return result.rows[0] || null;
}
