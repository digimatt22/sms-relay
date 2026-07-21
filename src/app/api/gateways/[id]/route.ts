import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/db";
import { requireAdminApi } from "@/lib/guards";
import { gatewayUpdateSchema } from "@/lib/validation";
import { accountHasRole, getAccountContext } from "@/lib/account-context";
import { getGatewayAccessLevel, hasGatewayAccessLevel } from "@/lib/gateway-access";
import { forbiddenResponse } from "@/lib/rbac";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if ("error" in admin) return admin.error;

  const { id } = await context.params;
  const account = await getAccountContext(admin.session);
  const accessLevel = await getGatewayAccessLevel({
    gatewayId: id,
    organizationId: account.organizationId,
    isPlatformAdmin: account.isPlatformAdmin
  });
  if (!hasGatewayAccessLevel(accessLevel, "details")) {
    return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
  }
  const gateway = await query(
    `SELECT id, name, status, api_key_prefix, api_key_last_used_at, last_heartbeat_at,
            software_version, hardware_type, modem_imei, sim_iccid, carrier, apn_profile,
            created_at, updated_at, disabled_at
       FROM gateways WHERE id = $1`,
    [id]
  );
  if (!gateway.rows[0]) return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
  const attempts = await query(
    `SELECT a.*, m.to_number_redacted,
            CASE
              WHEN COALESCE(m.metadata->>'systemType', '') IN ('password_reset', 'mobile_verification') THEN '[Security code hidden]'
              ELSE m.body
            END AS body,
            m.status AS message_status
       FROM message_attempts a
       JOIN messages m ON m.id = a.message_id
      WHERE a.gateway_id = $1
      ORDER BY a.started_at DESC
      LIMIT 50`,
    [id]
  );
  const health = await query(
    `SELECT * FROM gateway_health WHERE gateway_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [id]
  );
  return NextResponse.json({ gateway: gateway.rows[0], attempts: attempts.rows, health: health.rows });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if ("error" in admin) return admin.error;

  const { id } = await context.params;
  const account = await getAccountContext(admin.session);
  if (!accountHasRole(account, "operator")) return forbiddenResponse();
  const accessLevel = await getGatewayAccessLevel({
    gatewayId: id,
    organizationId: account.organizationId,
    isPlatformAdmin: account.isPlatformAdmin
  });
  if (!hasGatewayAccessLevel(accessLevel, "manage")) return forbiddenResponse();
  const parsed = gatewayUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await query(
    `UPDATE gateways
        SET name = $1,
            hardware_type = $2,
            carrier = $3,
            apn_profile = $4,
            location = $5,
            notes = $6,
            routing_weight = $7,
            hourly_send_limit = $8,
            updated_at = now()
      WHERE id = $9
      RETURNING id, name, status, hardware_type, carrier, apn_profile, location, notes,
                routing_weight, hourly_send_limit, updated_at`,
    [
      parsed.data.name,
      parsed.data.hardwareType || null,
      parsed.data.carrier || null,
      null,
      parsed.data.location || null,
      parsed.data.notes || null,
      parsed.data.routingWeight || 100,
      parsed.data.hourlySendLimit || null,
      id
    ]
  );
  if (!result.rows[0]) return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
  return NextResponse.json({ gateway: result.rows[0] });
}
