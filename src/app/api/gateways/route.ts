import { NextResponse, type NextRequest } from "next/server";
import { query, transaction } from "@/lib/db";
import { requireAdminApi } from "@/lib/guards";
import { createGatewayKey, gatewayKeyPrefix, hashGatewayKey } from "@/lib/security";
import { gatewayCreateSchema } from "@/lib/validation";
import { ensureDefaultGatewayPool } from "@/lib/organizations";
import { SUPPORTED_GATEWAY_CARRIERS, SUPPORTED_GATEWAY_HARDWARE } from "@/lib/gateway-options";
import { accountHasRole, getAccountContext } from "@/lib/account-context";
import { gatewayVisibilityClause } from "@/lib/gateway-access";
import { assertPlanCapacity } from "@/lib/plans";
import { forbiddenResponse } from "@/lib/rbac";

export async function GET() {
  const admin = await requireAdminApi();
  if ("error" in admin) return admin.error;
  const account = await getAccountContext(admin.session);

  const result = await query(
    `SELECT g.id, g.name, g.status, g.api_key_prefix, g.api_key_last_used_at, g.last_heartbeat_at,
            g.software_version, g.hardware_type, g.modem_imei, g.sim_iccid, g.carrier,
            g.visibility, g.created_at, g.updated_at, g.disabled_at,
            CASE
              WHEN $2::boolean = true THEN 'manage'
              WHEN g.owner_organization_id = $1 THEN 'manage'
              WHEN g.organization_id = $1 AND g.visibility <> 'shared' THEN 'manage'
              ELSE COALESCE(ga.access_level, 'none')
            END AS access_level
       FROM gateways g
       LEFT JOIN gateway_access ga
         ON ga.gateway_id = g.id
        AND ga.organization_id = $1
      WHERE ${gatewayVisibilityClause("g")}
      ORDER BY g.created_at DESC`,
    [account.organizationId, account.isPlatformAdmin]
  );
  return NextResponse.json({ gateways: result.rows });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminApi();
  if ("error" in admin) return admin.error;
  const account = await getAccountContext(admin.session);
  if (!accountHasRole(account, "org_admin")) return forbiddenResponse();

  const parsed = gatewayCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const apiKey = createGatewayKey();
  const hashedKey = hashGatewayKey(apiKey);
  const prefix = gatewayKeyPrefix(apiKey);
  const organizationId = account.organizationId;
  const visibility = account.isPlatformAdmin ? parsed.data.visibility : "client_owned";
  if (visibility === "client_owned") {
    try {
      await assertPlanCapacity(organizationId, account.plan, "gateway");
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Gateway limit exceeded" }, { status: 409 });
    }
  }
  const defaultGatewayPoolId = await ensureDefaultGatewayPool(organizationId);
  const gateway = await transaction(async (db) => {
    const result = await db.query(
      `INSERT INTO gateways (
         organization_id, owner_organization_id, visibility, name, hardware_type, carrier, apn_profile, api_key_hash, api_key_prefix
       )
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)
       RETURNING id, name, status, api_key_prefix, created_at`,
      [
        organizationId,
        visibility === "client_owned" ? organizationId : null,
        visibility,
        parsed.data.name,
        parsed.data.hardwareType || SUPPORTED_GATEWAY_HARDWARE[0].value,
        parsed.data.carrier || SUPPORTED_GATEWAY_CARRIERS[0].value,
        hashedKey,
        prefix
      ]
    );
    const created = result.rows[0];
    await db.query(
      `INSERT INTO gateway_keys (gateway_id, api_key_hash, api_key_prefix, label, created_by_user_id)
       VALUES ($1, $2, $3, 'Initial key', $4)`,
      [created.id, hashedKey, prefix, admin.session.user.id]
    );
    await db.query(
      `INSERT INTO gateway_pool_memberships (gateway_pool_id, gateway_id)
       VALUES ($1, $2)
       ON CONFLICT (gateway_pool_id, gateway_id) DO NOTHING`,
      [defaultGatewayPoolId, created.id]
    );
    await db.query(
      `INSERT INTO gateway_access (gateway_id, organization_id, access_level)
       VALUES ($1, $2, $3)
       ON CONFLICT (gateway_id, organization_id) DO UPDATE
         SET access_level = EXCLUDED.access_level,
             updated_at = now()`,
      [created.id, organizationId, visibility === "client_owned" ? "manage" : "status_only"]
    );
    return created;
  });
  return NextResponse.json({ gateway, apiKey }, { status: 201 });
}
