import { NextResponse, type NextRequest } from "next/server";
import { transaction } from "@/lib/db";
import { requireRoleApi } from "@/lib/guards";
import { createGatewayKey, gatewayKeyPrefix, hashGatewayKey } from "@/lib/security";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRoleApi("org_admin");
  if ("error" in admin) return admin.error;

  const { id } = await context.params;
  const apiKey = createGatewayKey();
  const hashedKey = hashGatewayKey(apiKey);
  const prefix = gatewayKeyPrefix(apiKey);

  const gateway = await transaction(async (db) => {
    const result = await db.query(
      `UPDATE gateways
          SET api_key_hash = $1, api_key_prefix = $2, updated_at = now()
        WHERE id = $3
        RETURNING id, name, api_key_prefix`,
      [hashedKey, prefix, id]
    );
    const updated = result.rows[0];
    if (!updated) return null;

    await db.query(
      `UPDATE gateway_keys
          SET status = 'revoked', revoked_at = now(), updated_at = now()
        WHERE gateway_id = $1
          AND status = 'active'`,
      [id]
    );
    await db.query(
      `INSERT INTO gateway_keys (
         gateway_id, api_key_hash, api_key_prefix, label, created_by_user_id
       )
       VALUES ($1, $2, $3, 'Rotated key', $4)`,
      [id, hashedKey, prefix, admin.session.user.id]
    );

    return updated;
  });

  if (!gateway) return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
  return NextResponse.json({ gateway, apiKey });
}
