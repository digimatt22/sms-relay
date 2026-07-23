import { z } from "zod";
import { normalizePhoneNumber } from "@/lib/phone";

const phoneNumberSchema = z.string().min(1).transform((value, context) => {
  try {
    return normalizePhoneNumber(value);
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "Invalid phone number"
    });
    return z.NEVER;
  }
});

export const messageCreateSchema = z.object({
  to: phoneNumberSchema,
  body: z.string().min(1).max(1600),
  programId: z.string().uuid(),
  recipientAuthorizationId: z.string().uuid().optional().nullable(),
  priority: z.coerce.number().int().min(0).max(1000).default(100),
  scheduledAt: z.string().datetime().optional().nullable(),
  idempotencyKey: z.string().min(1).max(200).optional().nullable(),
  metadata: z.record(z.unknown()).default({}),
  callbackUrl: z.string().url().optional().nullable(),
  conversationId: z.string().uuid().optional().nullable(),
  externalConversationReference: z.string().min(1).max(200).optional().nullable()
});

export const recipientAuthorizationRequestSchema = z.object({
  programId: z.string().uuid(),
  phoneNumber: phoneNumberSchema,
  clientRecipientReference: z.string().max(200).optional().nullable(),
  consentSource: z.enum(["client_form", "hosted"]).default("client_form"),
  recipientInitiated: z.literal(true),
  evidenceReference: z.string().max(500).optional().nullable(),
  idempotencyKey: z.string().min(1).max(200).optional().nullable(),
  callbackUrl: z.string().url().optional().nullable()
});

export const recipientAuthorizationConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/)
});

export const messagingProgramCreateSchema = z.object({
  name: z.string().min(1).max(120),
  senderDisplayName: z.string().min(1).max(120),
  messageClass: z.enum(["marketing", "informational_recurring", "user_requested_transactional"]),
  purpose: z.string().min(1).max(500),
  expectedFrequency: z.string().min(1).max(160),
  helpContact: z.string().min(1).max(200),
  termsUrl: z.string().url().optional().nullable(),
  privacyUrl: z.string().url().optional().nullable(),
  callbackUrl: z.string().url().optional().nullable()
});

export const messagingProgramUpdateSchema = z.object({
  status: z.literal("disabled").optional(),
  publicEnrollmentEnabled: z.boolean().optional()
}).refine((value) => value.status !== undefined || value.publicEnrollmentEnabled !== undefined, {
  message: "At least one program setting is required"
});

export const gatewayCreateSchema = z.object({
  name: z.string().min(1).max(100),
  hardwareType: z.string().max(100).optional().nullable(),
  carrier: z.string().max(100).optional().nullable(),
  visibility: z.enum(["shared", "client_owned"]).default("client_owned")
});

export const gatewayUpdateSchema = gatewayCreateSchema.extend({
  location: z.string().max(160).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  routingWeight: z.coerce.number().int().min(1).max(10000).optional().nullable(),
  hourlySendLimit: z.coerce.number().int().min(1).max(100000).optional().nullable()
});

export const apiClientCreateSchema = z.object({
  name: z.string().min(1).max(120),
  keyLabel: z.string().min(1).max(120).default("Production")
});

export const heartbeatSchema = z.object({
  status: z.enum(["online", "degraded"]).default("online"),
  softwareVersion: z.string().optional(),
  hardwareType: z.string().optional(),
  modemImei: z.string().optional(),
  simIccid: z.string().optional(),
  carrier: z.string().optional(),
  apnProfile: z.string().optional(),
  metrics: z.record(z.unknown()).default({})
});

export const gatewayLogSchema = z.object({
  logs: z.array(
    z.object({
      level: z.enum(["debug", "info", "warn", "error"]).default("info"),
      eventType: z.string().min(1),
      message: z.string().min(1),
      context: z.record(z.unknown()).default({})
    })
  )
});

export const inboundSmsSchema = z.object({
  messages: z.array(
    z.object({
      from: z.string().min(3),
      body: z.string().min(1).max(1600),
      receivedAt: z.string().datetime(),
      modemIndex: z.number().int().optional().nullable(),
      messageStatus: z.string().optional().nullable(),
      serviceCenter: z.string().optional().nullable(),
      metadata: z.record(z.unknown()).default({})
    })
  )
});

export const deliveryReportsSchema = z.object({
  reports: z.array(z.object({
    messageReference: z.number().int().min(0).max(255),
    recipient: z.string().optional(),
    serviceCenterTimestamp: z.string().datetime().optional(),
    dischargeTime: z.string().datetime().optional(),
    statusCode: z.number().int().min(0).max(255),
    normalizedStatus: z.enum(["delivered", "pending", "undelivered", "unknown"]),
    rawReport: z.string().min(1).max(4000),
    receivedAt: z.string().datetime()
  })).min(1).max(100)
});
