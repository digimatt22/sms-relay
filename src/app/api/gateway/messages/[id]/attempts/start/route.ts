import { NextResponse, type NextRequest } from "next/server";
import { requireGateway } from "@/lib/guards";
import { startAttempt } from "@/lib/messages";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gatewayAuth = await requireGateway(_request);
  if ("error" in gatewayAuth) return gatewayAuth.error;

  const { id } = await context.params;
  const attempt = await startAttempt(id, gatewayAuth.gateway.id);
  if (!attempt) return NextResponse.json({ error: "Message not claimable" }, { status: 409 });
  return NextResponse.json({ attempt });
}
