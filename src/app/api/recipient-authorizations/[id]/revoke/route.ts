import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireApiClient } from "@/lib/guards";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { revokeRecipientAuthorization } from "@/lib/recipient-authorizations";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  let organizationId: string;
  let actorId: string | null = null;
  let actorType: "admin_user" | "api_client" = "admin_user";
  if (!("error" in admin)) {
    organizationId = await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role });
    actorId = admin.session.user.id;
  } else {
    const client = await requireApiClient(request);
    if ("error" in client) return client.error;
    organizationId = client.client.organization_id;
    actorId = client.client.id;
    actorType = "api_client";
  }
  const { id } = await context.params;
  const result = await revokeRecipientAuthorization({ authorizationId: id, organizationId, actorId, actorType });
  if (!result) return NextResponse.json({ error: "Authorization not found" }, { status: 404 });
  return NextResponse.json({ revoked: true, canceledMessages: result.canceledMessageIds.length });
}
