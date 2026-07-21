import { NextResponse, type NextRequest } from "next/server";
import { completeGatewayCommand } from "@/lib/gateways";
import { requireGateway } from "@/lib/guards";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gatewayAuth = await requireGateway(request);
  if ("error" in gatewayAuth) return gatewayAuth.error;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const status = body.status === "completed" ? "completed" : "failed";
  const command = await completeGatewayCommand({
    gatewayId: gatewayAuth.gateway.id,
    commandId: id,
    status,
    result: typeof body.result === "object" && body.result ? body.result : {}
  });
  if (!command) return NextResponse.json({ error: "Command not found" }, { status: 404 });
  return NextResponse.json({ command });
}
