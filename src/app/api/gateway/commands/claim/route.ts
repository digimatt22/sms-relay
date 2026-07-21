import { NextResponse, type NextRequest } from "next/server";
import { claimGatewayCommands } from "@/lib/gateways";
import { requireGateway } from "@/lib/guards";

export async function POST(request: NextRequest) {
  const gatewayAuth = await requireGateway(request);
  if ("error" in gatewayAuth) return gatewayAuth.error;

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body.limit || 5), 20));
  const commands = await claimGatewayCommands(gatewayAuth.gateway.id, limit);
  return NextResponse.json({ commands });
}
