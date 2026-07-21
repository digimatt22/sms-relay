import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, requireApiClient } from "@/lib/guards";
import { cancelMessage } from "@/lib/messages";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  const client = "error" in admin ? await requireApiClient(request) : null;
  if ("error" in admin && client && "error" in client) return client.error;

  const { id } = await context.params;
  const message = await cancelMessage(id, {
    apiClientId: client && !("error" in client) ? client.client.id : null
  });
  if (!message) {
    return NextResponse.json(
      { error: "Message cannot be canceled or was not found" },
      { status: 409 }
    );
  }
  return NextResponse.json({ message });
}
