import { NextResponse, type NextRequest } from "next/server";
import { enableApiClient } from "@/lib/api-clients";
import { requireRoleApi } from "@/lib/guards";
import { getCurrentOrganizationId } from "@/lib/organizations";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRoleApi("org_admin");
  if ("error" in admin) return admin.error;

  const { id } = await context.params;
  const client = await enableApiClient(id, {
    organizationId: await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role })
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  return NextResponse.json({ client });
}
