import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireApiClient } from "@/lib/guards";
import { createMessage, listMessages } from "@/lib/messages";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { messageCreateSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const admin = await requireAdminApi();
  if ("error" in admin) return admin.error;

  const status = request.nextUrl.searchParams.get("status");
  const organizationId = await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role });
  return NextResponse.json({ messages: await listMessages(status, { organizationId }) });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminApi();
  const client = "error" in admin ? await requireApiClient(request) : null;
  if ("error" in admin && client && "error" in client) return client.error;

  const parsed = messageCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const message = await createMessage({
      ...parsed.data,
      userId: "error" in admin ? null : admin.session.user.id,
      apiClientId: client && !("error" in client) ? client.client.id : null,
      apiClientKeyId: client && !("error" in client) ? client.client.key_id : null,
      submittedVia: client && !("error" in client) ? "api" : "dashboard",
      messagingProgramId: parsed.data.programId,
      conversationThreadId: parsed.data.conversationId || null,
      externalConversationReference: parsed.data.externalConversationReference || null,
      recipientAuthorizationId: parsed.data.recipientAuthorizationId || null,
      messageCategory: "ordinary",
      organizationId: "error" in admin
        ? client && !("error" in client) ? client.client.organization_id : undefined
        : await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role })
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message could not be created";
    const status = message === "recipient_authorization_required" || message === "recipient_opted_out" || message === "recipient_platform_suppressed"
      ? 403
      : message === "program_not_active" || message === "recipient_verification_pending"
        ? 409
        : 400;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
