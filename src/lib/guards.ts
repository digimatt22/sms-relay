import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { hashGatewayKey } from "@/lib/security";
import type { GatewayAuth } from "@/lib/types";
import { authenticateApiClient } from "@/lib/api-clients";
import { forbiddenResponse, hasRole, type Role } from "@/lib/rbac";
import { mustChangePassword } from "@/lib/passwords";

export async function requireAdminApi() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (await mustChangePassword(session.user.id)) {
    return { error: NextResponse.json({ error: "Password change required" }, { status: 403 }) };
  }
  return { session };
}

export async function requireRoleApi(minimumRole: Role) {
  const admin = await requireAdminApi();
  if ("error" in admin) return admin;
  if (!hasRole(admin.session, minimumRole)) {
    return { error: forbiddenResponse() };
  }
  return admin;
}

export async function requireGateway(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const [, key] = header.match(/^Bearer\s+(.+)$/i) || [];
  if (!key) {
    return { error: NextResponse.json({ error: "Gateway API key required" }, { status: 401 }) };
  }

  const gateway = await transaction(async (db) => {
    const result = await db.query<GatewayAuth & { key_id: string }>(
      `SELECT g.id, g.name, g.status, g.organization_id, k.id AS key_id
         FROM gateway_keys k
         JOIN gateways g ON g.id = k.gateway_id
        WHERE k.api_key_hash = $1
          AND k.status = 'active'
          AND g.disabled_at IS NULL`,
      [hashGatewayKey(key)]
    );
    const found = result.rows[0];
    if (!found) return null;

    await db.query(
      `UPDATE gateway_keys
          SET last_used_at = now(), updated_at = now()
        WHERE id = $1`,
      [found.key_id]
    );
    await db.query(
      `UPDATE gateways
          SET api_key_last_used_at = now(), updated_at = now()
        WHERE id = $1`,
      [found.id]
    );

    return {
      id: found.id,
      name: found.name,
      status: found.status,
      organization_id: found.organization_id
    };
  });
  if (!gateway) {
    return { error: NextResponse.json({ error: "Invalid gateway API key" }, { status: 401 }) };
  }
  if (gateway.status === "disabled") {
    return { error: NextResponse.json({ error: "Gateway disabled" }, { status: 403 }) };
  }
  return { gateway };
}

export async function requireApiClient(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const [, key] = header.match(/^Bearer\s+(.+)$/i) || [];
  if (!key) {
    return { error: NextResponse.json({ error: "Client API key required" }, { status: 401 }) };
  }

  const client = await authenticateApiClient(key);
  if (!client) {
    return { error: NextResponse.json({ error: "Invalid client API key" }, { status: 401 }) };
  }
  return { client };
}
