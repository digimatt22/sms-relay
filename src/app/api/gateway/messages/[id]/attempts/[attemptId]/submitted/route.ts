import { NextResponse, type NextRequest } from "next/server";
import { requireGateway } from "@/lib/guards";
import { markSubmitted } from "@/lib/messages";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; attemptId: string }> }) {
  const gatewayAuth = await requireGateway(request);
  if ("error" in gatewayAuth) return gatewayAuth.error;

  const { id, attemptId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const message = await markSubmitted(id, attemptId, gatewayAuth.gateway.id, body.modemResponse);
  if (!message) return NextResponse.json({ error: "Message attempt not updatable" }, { status: 409 });
  return NextResponse.json({ message });
}
