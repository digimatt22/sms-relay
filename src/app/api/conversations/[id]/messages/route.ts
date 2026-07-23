import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiClient } from "@/lib/guards";
import { getConversation } from "@/lib/conversations";
import { createMessage } from "@/lib/messages";

const createSchema = z.object({
  body: z.string().min(1).max(1600),
  priority: z.coerce.number().int().min(0).max(1000).default(100),
  scheduledAt: z.string().datetime().optional().nullable(),
  idempotencyKey: z.string().min(1).max(200).optional().nullable(),
  metadata: z.record(z.unknown()).default({})
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiClient(request);
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const result = await getConversation(id, auth.client.key_id);
  if (!result || result.conversation.status !== "open") {
    return NextResponse.json({ error: "Open conversation not found" }, { status: 404 });
  }
  if (!result.conversation.messaging_program_id) {
    return NextResponse.json({ error: "Conversation has no messaging program" }, { status: 409 });
  }
  try {
    const message = await createMessage({
      to: result.conversation.participant_number,
      body: parsed.data.body,
      priority: parsed.data.priority,
      scheduledAt: parsed.data.scheduledAt,
      idempotencyKey: parsed.data.idempotencyKey,
      metadata: parsed.data.metadata,
      organizationId: auth.client.organization_id,
      apiClientId: auth.client.id,
      apiClientKeyId: auth.client.key_id,
      submittedVia: "api",
      messagingProgramId: result.conversation.messaging_program_id,
      conversationThreadId: id,
      messageCategory: "ordinary"
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Message could not be created" }, { status: 400 });
  }
}
