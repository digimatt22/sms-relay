import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/db";
import { requireAdminApi } from "@/lib/guards";
import { getCurrentOrganizationId } from "@/lib/organizations";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if ("error" in admin) return admin.error;

  const { id } = await context.params;
  const organizationId = await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role });
  const result = await query(
    "SELECT * FROM gateway_logs WHERE gateway_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 200",
    [id, organizationId]
  );
  return NextResponse.json({ logs: result.rows });
}
