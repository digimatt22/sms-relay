import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireApiClient } from "@/lib/guards";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { confirmRecipientAuthorization } from "@/lib/recipient-authorizations";
import { recipientAuthorizationConfirmSchema } from "@/lib/validation";

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
  const parsed = recipientAuthorizationConfirmSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const authorization = await confirmRecipientAuthorization({ authorizationId: id, code: parsed.data.code, organizationId, actorId, actorType });
  if (!authorization) return NextResponse.json({ error: "Verification code is invalid, expired, or has too many attempts" }, { status: 400 });
  const { phone_number, ...safe } = authorization;
  void phone_number;
  return NextResponse.json({ authorization: safe });
}
