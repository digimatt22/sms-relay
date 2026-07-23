import { NextResponse, type NextRequest } from "next/server";
import { requireApiClient } from "@/lib/guards";
import { disableWebhookSubscription } from "@/lib/webhook-subscriptions";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiClient(request);
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const subscription = await disableWebhookSubscription(id, auth.client.key_id);
  if (!subscription) return NextResponse.json({ error: "Webhook subscription not found" }, { status: 404 });
  return NextResponse.json({ subscription });
}
