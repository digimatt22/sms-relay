import { NextResponse, type NextRequest } from "next/server";
import { retryCallbackDelivery } from "@/lib/callbacks";
import { requireAdminApi } from "@/lib/guards";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if ("error" in admin) return admin.error;

  const { id } = await context.params;
  const result = await retryCallbackDelivery(id);
  if (!result) return NextResponse.json({ error: "Callback delivery not found" }, { status: 404 });
  return NextResponse.json({ result });
}
