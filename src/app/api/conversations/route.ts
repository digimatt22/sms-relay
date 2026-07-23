import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiClient } from "@/lib/guards";
import { createConversation, listConversations } from "@/lib/conversations";

const createSchema = z.object({
  to: z.string().min(3),
  programId: z.string().uuid().optional().nullable(),
  externalReference: z.string().min(1).max(200).optional().nullable(),
  metadata: z.record(z.unknown()).default({})
});

export async function GET(request: NextRequest) {
  const auth = await requireApiClient(request);
  if ("error" in auth) return auth.error;
  return NextResponse.json({
    conversations: await listConversations({
      apiClientKeyId: auth.client.key_id,
      status: request.nextUrl.searchParams.get("status"),
      limit: Number(request.nextUrl.searchParams.get("limit") || 100)
    })
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiClient(request);
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const conversation = await createConversation({
      organizationId: auth.client.organization_id,
      apiClientId: auth.client.id,
      apiClientKeyId: auth.client.key_id,
      participantNumber: parsed.data.to,
      messagingProgramId: parsed.data.programId,
      externalReference: parsed.data.externalReference,
      metadata: parsed.data.metadata
    });
    return NextResponse.json({ conversation }, { status: conversation.was_created ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Conversation could not be created" }, { status: 400 });
  }
}
