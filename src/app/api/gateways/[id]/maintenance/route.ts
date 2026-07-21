import { NextResponse, type NextRequest } from "next/server";
import { markGatewayMaintenance } from "@/lib/gateways";
import { requireRoleApi } from "@/lib/guards";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireRoleApi("operator");
  if ("error" in admin) return admin.error;

  const { id } = await context.params;
  const gateway = await markGatewayMaintenance(id);
  if (!gateway) return NextResponse.json({ error: "Gateway not found or disabled" }, { status: 404 });
  return NextResponse.json({ gateway });
}
