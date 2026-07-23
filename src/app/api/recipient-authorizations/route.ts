import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireApiClient } from "@/lib/guards";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { listRecipientAuthorizations, requestRecipientAuthorization } from "@/lib/recipient-authorizations";
import { recipientAuthorizationRequestSchema } from "@/lib/validation";

async function requestContext(request: NextRequest) {
  const admin = await requireAdminApi();
  if (!("error" in admin)) {
    return {
      organizationId: await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role }),
      userId: admin.session.user.id,
      apiClientId: null,
      apiClientKeyId: null,
      actorType: "admin_user" as const
    };
  }
  const client = await requireApiClient(request);
  if ("error" in client) return { error: client.error };
  return {
    organizationId: client.client.organization_id,
    userId: null,
    apiClientId: client.client.id,
    apiClientKeyId: client.client.key_id,
    actorType: "api_client" as const
  };
}

export async function GET(request: NextRequest) {
  const context = await requestContext(request);
  if ("error" in context) return context.error;
  return NextResponse.json({ authorizations: await listRecipientAuthorizations({ organizationId: context.organizationId }) });
}

export async function POST(request: NextRequest) {
  const context = await requestContext(request);
  if ("error" in context) return context.error;
  const parsed = recipientAuthorizationRequestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const authorization = await requestRecipientAuthorization({
      organizationId: context.organizationId,
      programId: parsed.data.programId,
      phoneNumber: parsed.data.phoneNumber,
      clientRecipientReference: parsed.data.clientRecipientReference,
      consentSource: parsed.data.consentSource,
      recipientInitiated: true,
      evidenceReference: parsed.data.evidenceReference,
      idempotencyKey: parsed.data.idempotencyKey,
      callbackUrl: parsed.data.callbackUrl,
      userId: context.userId,
      apiClientId: context.apiClientId,
      apiClientKeyId: context.apiClientKeyId,
      actorType: context.actorType
    });
    return NextResponse.json({ authorization: sanitize(authorization) }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Authorization could not be requested" }, { status: 400 });
  }
}

function sanitize(authorization: any) {
  const { phone_number, ...safe } = authorization;
  void phone_number;
  return safe;
}
