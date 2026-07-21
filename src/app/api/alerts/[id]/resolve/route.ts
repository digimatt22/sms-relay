import { NextResponse, type NextRequest } from "next/server";
import { resolveAlert } from "@/lib/alerts";
import { requireAdminApi } from "@/lib/guards";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if ("error" in admin) return admin.error;

  const { id } = await context.params;
  const alert = await resolveAlert(id);
  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  return NextResponse.json({ alert });
}
