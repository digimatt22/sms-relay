# API Specification

Status: Draft.

## API Style
Use JSON over HTTPS. Implement dashboard/admin endpoints with session auth and gateway endpoints with per-gateway static API keys.

## Admin Endpoints
- `POST /api/messages`: create an outbound message.
- `GET /api/messages`: list/filter queue by status, gateway, date, priority, customer, and search.
- `GET /api/messages/:id`: message detail with attempts.
- `POST /api/messages/:id/cancel`: cancel queued or retry-scheduled message.
- `POST /api/messages/:id/requeue`: manually requeue failed/dead-lettered message.
- `GET /api/gateways`: list gateways and health summary.
- `POST /api/gateways`: create gateway and issue one-time API key.
- `GET /api/gateways/:id`: gateway detail.
- `POST /api/gateways/:id/rotate-key`: rotate gateway API key.
- `POST /api/gateways/:id/disable`: disable gateway.
- `GET /api/gateways/:id/logs`: gateway logs.

## Gateway Endpoints
- `POST /api/gateway/heartbeat`: update gateway health and last-seen timestamp.
- `POST /api/gateway/logs`: ingest gateway log batch.
- `POST /api/gateway/messages/claim`: atomically claim the next eligible message.
- `POST /api/gateway/messages/:id/attempts/start`: record send attempt start.
- `POST /api/gateway/messages/:id/attempts/:attemptId/submitted`: mark carrier-submitted.
- `POST /api/gateway/messages/:id/attempts/:attemptId/failed`: record failure and schedule retry/dead-letter.

## Claim Semantics
- Eligible messages have `queued` or `retry_scheduled` status, `scheduled_at <= now`, `next_attempt_at <= now`, and no active lease.
- A claim sets `status = claimed`, `claim_gateway_id`, and `claim_expires_at = now + 2 minutes`.
- Expired claims are eligible for another gateway.
- MVP duplicate prevention is best effort; the API must avoid assigning the same currently leased message to two gateways.

## Message Insert Payload
Required:
- `to`
- `body`

Optional:
- `priority`
- `scheduledAt`
- `idempotencyKey`
- `metadata`
- `callbackUrl`

## Decisions
- `customerRef` should be stored inside `metadata` for MVP.
- Dashboard/auth endpoints use Auth.js/NextAuth.js local database-backed credentials for MVP.
- Gateway heartbeat interval is configurable in the 1-5 minute range.
- Logs sent through the API must redact phone numbers while preserving last 4 digits.
- Logs may include SMS body for MVP.

## Open Questions
- Confirm whether callbacks are required in MVP or only stored for future use.
