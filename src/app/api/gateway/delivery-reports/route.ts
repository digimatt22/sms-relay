import { NextResponse, type NextRequest } from "next/server";
import { requireGateway } from "@/lib/guards";
import { deliveryReportsSchema } from "@/lib/validation";
import { ingestDeliveryReceipt } from "@/lib/delivery-receipts";

export async function POST(request: NextRequest) {
  const auth = await requireGateway(request);
  if ("error" in auth) return auth.error;
  const parsed = deliveryReportsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const receipts = [];
  for (const report of parsed.data.reports) {
    const receipt = await ingestDeliveryReceipt({ gatewayId: auth.gateway.id, ...report });
    receipts.push({ id: receipt.id, matched: receipt.matched, normalizedStatus: receipt.normalized_status });
  }
  return NextResponse.json({ receipts });
}
