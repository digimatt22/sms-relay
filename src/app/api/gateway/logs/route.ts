import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/db";
import { requireGateway } from "@/lib/guards";
import { gatewayLogSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const gatewayAuth = await requireGateway(request);
  if ("error" in gatewayAuth) return gatewayAuth.error;

  const parsed = gatewayLogSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  for (const log of parsed.data.logs) {
    await query(
      `INSERT INTO gateway_logs (organization_id, gateway_id, level, event_type, message, context)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        gatewayAuth.gateway.organization_id,
        gatewayAuth.gateway.id,
        log.level,
        log.eventType,
        log.message,
        JSON.stringify(log.context)
      ]
    );
  }
  return NextResponse.json({ ok: true });
}
