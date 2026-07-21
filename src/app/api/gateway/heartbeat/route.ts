import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/db";
import { requireGateway } from "@/lib/guards";
import { heartbeatSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const gatewayAuth = await requireGateway(request);
  if ("error" in gatewayAuth) return gatewayAuth.error;

  const parsed = heartbeatSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await query(
    `UPDATE gateways
        SET status = $1,
            last_heartbeat_at = now(),
            software_version = COALESCE($2, software_version),
            hardware_type = COALESCE($3, hardware_type),
            modem_imei = COALESCE($4, modem_imei),
            sim_iccid = COALESCE($5, sim_iccid),
            carrier = COALESCE($6, carrier),
            apn_profile = COALESCE($7, apn_profile),
            updated_at = now()
      WHERE id = $8`,
    [
      parsed.data.status,
      parsed.data.softwareVersion,
      parsed.data.hardwareType,
      parsed.data.modemImei,
      parsed.data.simIccid,
      parsed.data.carrier,
      parsed.data.apnProfile,
      gatewayAuth.gateway.id
    ]
  );
  await query(
    "INSERT INTO gateway_health (organization_id, gateway_id, status, metrics) VALUES ($1, $2, $3, $4::jsonb)",
    [gatewayAuth.gateway.organization_id, gatewayAuth.gateway.id, parsed.data.status, JSON.stringify(parsed.data.metrics)]
  );
  return NextResponse.json({ ok: true });
}
