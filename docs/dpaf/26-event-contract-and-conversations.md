# Event Contract, Delivery Receipts, and Conversation Threads

Status: Implemented in migration 019 and application code on 2026-07-22.

## Decisions

- Delivery states distinguish modem/carrier acceptance from handset delivery.
- Conversation threads are durable resources, not a UI grouping by phone number.
- A conversation is owned by the exact API key that created it.
- Webhook subscriptions are owned by the exact API key that created them.
- Platform events are append-only and use schema version `2026-07-22`.
- AWS SNS and Twilio are not transport fallbacks.

## Delivery semantics

The gateway requests SMS status reports and preserves the modem's `+CMGS` message reference. It uploads parsed `+CDS` reports to `/api/gateway/delivery-reports`. The hub fingerprints every report, correlates it to a gateway attempt by gateway/reference/recipient/time, stores the raw evidence, and normalizes it to:

- `pending`
- `delivered`
- `undelivered`
- `unknown`

The corresponding terminal message states are `delivery_confirmed`, `delivery_failed`, and `delivery_unknown`. State ranking prevents late interim reports from regressing an already stronger result. A report proves only what the carrier reports; device support and carrier behavior still require field qualification.

## Conversation semantics

`conversation_threads` binds an API key, participant, optional messaging program, sticky gateway, external reference, and arbitrary client metadata. The external reference is the primary correlation point for a SwimSense alert, Stratus work item, or another client workflow.

Endpoints:

- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/{id}`
- `DELETE /api/conversations/{id}`
- `POST /api/conversations/{id}/messages`

Ordinary API sends automatically create or reuse the open key/participant thread. A caller can instead pass `conversationId` or `externalConversationReference`. Inbound replies attach to the recent conversation that used the receiving gateway. Ambiguous attribution is deliberately not guessed.

## Webhook semantics

Endpoints:

- `GET /api/webhook-subscriptions`
- `POST /api/webhook-subscriptions`
- `DELETE /api/webhook-subscriptions/{id}`

Every event is persisted in `platform_events`. Matching subscriptions create durable `callback_deliveries`, signed with a secret derived for that subscription. Retries use the same event ID and a distinct delivery ID. Consumers must use the envelope `id` for idempotency and accept additive fields.

The complete catalog and payload examples are maintained in `22-webhook-integration-guide.md`. The canonical source of truth in code is `src/lib/event-contract.ts`.

## Acceptance evidence

- Durable schema exists for receipts, conversations, key subscriptions, events, and callback relationships.
- Gateway reports the modem reference and delivery receipts.
- Client API resources are scoped to the authenticated key ID.
- Events contain applicable message, inbound, conversation, authorization, and transition context.
- Message detail UI separates carrier submission from handset delivery and displays receipt history.
- Focused integration tests, lint, TypeScript, gateway compilation, and production web build pass.

## Deployment note

Migration 019 was applied to the local SMS Gateway PostgreSQL database and the Sheldon production database on 2026-07-22. Pre-migration backups were created before each change. The live application release and public gateway package were then deployed to `sns.digicolony.net` and verified through the origin and public HTTPS health endpoints.
