import { NextResponse, type NextRequest } from "next/server";
import { requireGateway } from "@/lib/guards";
import { ingestInboundSms } from "@/lib/inbound";
import { inboundSmsSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const gatewayAuth = await requireGateway(request);
  if ("error" in gatewayAuth) return gatewayAuth.error;

  const parsed = inboundSmsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const results = [];
  for (const message of parsed.data.messages) {
    const inbound = await ingestInboundSms({
      gatewayId: gatewayAuth.gateway.id,
      from: message.from,
      body: message.body,
      receivedAt: message.receivedAt,
      modemIndex: message.modemIndex,
      messageStatus: message.messageStatus,
      serviceCenter: message.serviceCenter,
      metadata: message.metadata
    });
    results.push({
      id: inbound.id,
      modemIndex: inbound.modem_index,
      callbackStatus: inbound.callback_status
    });
  }

  return NextResponse.json({ messages: results });
}
