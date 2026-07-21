import { NextResponse, type NextRequest } from "next/server";
import { updateApiClientLimits } from "@/lib/api-clients";
import { requireRoleApi } from "@/lib/guards";
import { getCurrentOrganizationId } from "@/lib/organizations";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRoleApi("org_admin");
  if ("error" in admin) return admin.error;

  const { id } = await context.params;
  const body = await request.json();
  const client = await updateApiClientLimits({
    clientId: id,
    hourlyMessageLimit: body.hourlyMessageLimit === null || body.hourlyMessageLimit === undefined
      ? null
      : Number(body.hourlyMessageLimit),
    dailyMessageLimit: body.dailyMessageLimit === null || body.dailyMessageLimit === undefined
      ? null
      : Number(body.dailyMessageLimit),
    organizationId: await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role })
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  return NextResponse.json({ client });
}
