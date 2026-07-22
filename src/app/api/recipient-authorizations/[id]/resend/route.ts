import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireApiClient } from "@/lib/guards";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { resendRecipientAuthorization } from "@/lib/recipient-authorizations";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  let organizationId: string;
  let userId: string | null = null;
  let apiClientId: string | null = null;
  if (!("error" in admin)) {
    organizationId = await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role });
    userId = admin.session.user.id;
  } else {
    const client = await requireApiClient(request);
    if ("error" in client) return client.error;
    organizationId = client.client.organization_id;
    apiClientId = client.client.id;
  }
  const { id } = await context.params;
  try {
    const authorization = await resendRecipientAuthorization({ authorizationId: id, organizationId, userId, apiClientId });
    const { phone_number, ...safe } = authorization;
    void phone_number;
    return NextResponse.json({ authorization: safe }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Verification could not be resent" }, { status: 400 });
  }
}
