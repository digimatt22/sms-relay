import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireApiClient } from "@/lib/guards";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { getRecipientAuthorization } from "@/lib/recipient-authorizations";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  let organizationId: string;
  if (!("error" in admin)) {
    organizationId = await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role });
  } else {
    const client = await requireApiClient(request);
    if ("error" in client) return client.error;
    organizationId = client.client.organization_id;
  }
  const { id } = await context.params;
  const authorization = await getRecipientAuthorization(id, { organizationId });
  if (!authorization) return NextResponse.json({ error: "Authorization not found" }, { status: 404 });
  const { phone_number, ...safe } = authorization;
  void phone_number;
  return NextResponse.json({ authorization: safe });
}
