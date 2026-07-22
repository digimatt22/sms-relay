import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireApiClient, requireRoleApi } from "@/lib/guards";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { createMessagingProgram, listMessagingPrograms } from "@/lib/messaging-programs";
import { messagingProgramCreateSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const admin = await requireAdminApi();
  if (!("error" in admin)) {
    const organizationId = await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role });
    return NextResponse.json({ programs: await listMessagingPrograms({ organizationId }) });
  }
  const client = await requireApiClient(request);
  if ("error" in client) return client.error;
  return NextResponse.json({ programs: await listMessagingPrograms({ organizationId: client.client.organization_id, activeOnly: true }) });
}

export async function POST(request: NextRequest) {
  const admin = await requireRoleApi("org_admin");
  if ("error" in admin) return admin.error;
  const parsed = messagingProgramCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const organizationId = await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role });
  try {
    const program = await createMessagingProgram({
      organizationId,
      ...parsed.data,
      createdByUserId: admin.session.user.id,
      activate: admin.session.user.role === "platform_admin"
    });
    return NextResponse.json({ program }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Program could not be created" }, { status: 400 });
  }
}
