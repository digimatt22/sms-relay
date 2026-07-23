import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiClient } from "@/lib/guards";
import { createWebhookSubscription, listWebhookSubscriptions } from "@/lib/webhook-subscriptions";

const createSchema = z.object({
  callbackUrl: z.string().url(),
  description: z.string().max(200).optional().nullable(),
  eventTypes: z.array(z.string().min(1)).min(1).default(["*"])
});

export async function GET(request: NextRequest) {
  const auth = await requireApiClient(request);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ subscriptions: await listWebhookSubscriptions(auth.client.key_id) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiClient(request);
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createWebhookSubscription({
      organizationId: auth.client.organization_id,
      apiClientId: auth.client.id,
      apiClientKeyId: auth.client.key_id,
      callbackUrl: parsed.data.callbackUrl,
      description: parsed.data.description,
      eventTypes: parsed.data.eventTypes
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook subscription could not be created" }, { status: 400 });
  }
}
