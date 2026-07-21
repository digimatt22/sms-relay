import { NextResponse, type NextRequest } from "next/server";
import { requireGateway } from "@/lib/guards";
import { markFailed } from "@/lib/messages";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; attemptId: string }> }) {
  const gatewayAuth = await requireGateway(request);
  if ("error" in gatewayAuth) return gatewayAuth.error;

  const { id, attemptId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const transcript = typeof body.context?.transcript === "string" ? body.context.transcript : "";
  const message = await markFailed({
    messageId: id,
    attemptId,
    gatewayId: gatewayAuth.gateway.id,
    errorCode: body.errorCode || transcript.slice(0, 200) || undefined,
    errorMessage: body.errorMessage
  });
  if (!message) return NextResponse.json({ error: "Message attempt not updatable" }, { status: 409 });
  return NextResponse.json({ message });
}
