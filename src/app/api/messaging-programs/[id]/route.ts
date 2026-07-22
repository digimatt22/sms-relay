import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireApiClient, requireRoleApi } from "@/lib/guards";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { getMessagingProgram, updateMessagingProgram } from "@/lib/messaging-programs";
import { messagingProgramUpdateSchema } from "@/lib/validation";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const admin = await requireAdminApi();
  if (!("error" in admin)) {
    const organizationId = await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role });
    const program = await getMessagingProgram(id, { organizationId });
    return program ? NextResponse.json({ program }) : NextResponse.json({ error: "Program not found" }, { status: 404 });
  }
  const client = await requireApiClient(request);
  if ("error" in client) return client.error;
  const program = await getMessagingProgram(id, { organizationId: client.client.organization_id, activeOnly: true });
  return program ? NextResponse.json({ program }) : NextResponse.json({ error: "Program not found" }, { status: 404 });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRoleApi("org_admin");
  if ("error" in admin) return admin.error;
  const parsed = messagingProgramUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const organizationId = await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role });
  const { id } = await context.params;
  const program = await updateMessagingProgram({ programId: id, organizationId, ...parsed.data });
  return program ? NextResponse.json({ program }) : NextResponse.json({ error: "Program not found" }, { status: 404 });
}
