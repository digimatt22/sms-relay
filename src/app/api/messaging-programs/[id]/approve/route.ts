import { NextResponse, type NextRequest } from "next/server";
import { requireRoleApi } from "@/lib/guards";
import { approveMessagingProgram } from "@/lib/messaging-programs";
import { getCurrentOrganizationId } from "@/lib/organizations";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRoleApi("platform_admin");
  if ("error" in admin) return admin.error;
  const { id } = await context.params;
  const organizationId = await getCurrentOrganizationId({ userId: admin.session.user.id, role: admin.session.user.role });
  const program = await approveMessagingProgram({
    programId: id,
    organizationId,
    approvedByUserId: admin.session.user.id
  });
  if (!program) return NextResponse.json({ error: "Program not found or already reviewed" }, { status: 404 });
  return NextResponse.json({ program });
}
