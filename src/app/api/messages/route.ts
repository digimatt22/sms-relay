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
      submittedVia: client && !("error" in client) ? "api" : "dashboard",
      organizationId: "error" in admin
        ? client && !("error" in client) ? client.client.organization_id : undefined
        : await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role })
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Message could not be created" },
      { status: 400 }
    );
  }
}
