import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireApiClient } from "@/lib/guards";
import { getMessage } from "@/lib/messages";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  const client = "error" in admin ? await requireApiClient(request) : null;
  if ("error" in admin && client && "error" in client) return client.error;

  const { id } = await context.params;
  const result = await getMessage(id, {
    apiClientId: client && !("error" in client) ? client.client.id : null
  });
  if (!result.message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
