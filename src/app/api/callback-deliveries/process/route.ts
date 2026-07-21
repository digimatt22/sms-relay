import { NextResponse, type NextRequest } from "next/server";
import { processPendingCallbackDeliveries } from "@/lib/callbacks";
import { requireAdminApi } from "@/lib/guards";

export async function POST(request: NextRequest) {
  const admin = await requireAdminApi();
  if ("error" in admin) return admin.error;

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body.limit || 25), 100));
  const results = await processPendingCallbackDeliveries(limit);
  return NextResponse.json({ processed: results.length, results });
}
