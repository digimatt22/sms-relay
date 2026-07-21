import { NextResponse, type NextRequest } from "next/server";
import { requireRoleApi } from "@/lib/guards";
import { rotateApiClientKey } from "@/lib/api-clients";
import { getCurrentOrganizationId } from "@/lib/organizations";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRoleApi("org_admin");
  if ("error" in admin) return admin.error;

  const { id } = await context.params;
  const result = await rotateApiClientKey({
    clientId: id,
    userId: admin.session.user.id,
    organizationId: await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role })
  });
  if (!result) return NextResponse.json({ error: "Client not found or disabled" }, { status: 404 });

  return NextResponse.json({ client: result.client, apiKey: result.apiKey });
}
