import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/db";
import { requireRoleApi } from "@/lib/guards";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRoleApi("operator");
  if ("error" in admin) return admin.error;

  const { id } = await context.params;
  const result = await query(
    `UPDATE gateways
        SET status = 'disabled', disabled_at = now(), updated_at = now()
      WHERE id = $1
      RETURNING id, name, status`,
    [id]
  );
  return NextResponse.json({ gateway: result.rows[0] });
}
