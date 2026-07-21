import { NextResponse, type NextRequest } from "next/server";
import {
  createDashboardUser,
  removeOrganizationMembership,
  upsertOrganizationMembership
} from "@/lib/organizations";
import { requireRoleApi } from "@/lib/guards";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRoleApi("org_admin");
  if ("error" in admin) return admin.error;

  const { id: organizationId } = await context.params;
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const role = String(body.role || "viewer");
  let userId = String(body.userId || "");

  if (!userId) {
    const password = String(body.password || "");
    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required when userId is omitted" }, { status: 400 });
    }
    const user = await createDashboardUser({
      email,
      name: body.name ? String(body.name) : null,
      password,
      role
    });
    userId = user.id;
  }

  const membership = await upsertOrganizationMembership({ organizationId, userId, role });
  return NextResponse.json({ membership }, { status: 201 });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRoleApi("org_admin");
  if ("error" in admin) return admin.error;

  const { id: organizationId } = await context.params;
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const membership = await removeOrganizationMembership({ organizationId, userId });
  if (!membership) return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  return NextResponse.json({ membership });
}
