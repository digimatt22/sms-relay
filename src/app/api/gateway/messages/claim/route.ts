import { NextResponse, type NextRequest } from "next/server";
import { requireGateway } from "@/lib/guards";
import { claimNextMessage } from "@/lib/messages";

export async function POST(request: NextRequest) {
  const gatewayAuth = await requireGateway(request);
  if ("error" in gatewayAuth) return gatewayAuth.error;

  const message = await claimNextMessage(gatewayAuth.gateway.id);
  return NextResponse.json({ message });
}
