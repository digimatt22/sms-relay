import { NextResponse, type NextRequest } from "next/server";
import { requireApiClient } from "@/lib/guards";
import { closeConversation, getConversation } from "@/lib/conversations";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiClient(request);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const result = await getConversation(id, auth.client.key_id);
  if (!result) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiClient(request);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const conversation = await closeConversation(id, auth.client.key_id);
  if (!conversation) return NextResponse.json({ error: "Open conversation not found" }, { status: 404 });
  return NextResponse.json({ conversation });
}
