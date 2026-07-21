import { NextResponse, type NextRequest } from "next/server";
import { enableGateway } from "@/lib/gateways";
import { requireRoleApi } from "@/lib/guards";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRoleApi("operator");
  if ("error" in admin) return admin.error;

  const { id } = await context.params;
  const gateway = await enableGateway(id);
  if (!gateway) return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
  return NextResponse.json({ gateway });
}
