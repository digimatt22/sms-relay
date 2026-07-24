# Testing Strategy

Status: Draft.

## Automated Tests
- Unit tests for message lifecycle transitions.
- Unit tests for retry/backoff calculation.
- Unit tests for gateway API-key validation.
- Integration tests for message insertion and idempotency.
- Integration tests for atomic claim behavior under concurrent gateway requests.
- Integration tests for expired lease re-claim.
- Integration tests for logs and health ingestion.
- Unit tests for readiness success, database-independent liveness, and generic
  readiness failure responses that do not expose database details.
- Configuration tests that reject runtime database usernames other than
  `relayhub_sms_runtime`.
- Component tests for dashboard tables/forms where practical.

## Hardware/Service Tests
- Mock modem test path for CI and local development.
- SIM7070 integration test script for real hardware.
- Network interruption test: gateway buffers/retries logs and resumes polling.
- Modem reconnect test.

## Manual Acceptance Tests
- Admin creates a message in dashboard.
- Gateway claims and sends the message.
- Message reaches `carrier_submitted`.
- Two or three gateways polling together do not receive the same active claim.
- A claimed message whose gateway stops is reassignable after timeout.
- Failed sends retry up to 3 times and then dead-letter.
- Gateway health/logs appear in dashboard.

## Validation Commands
Exact commands depend on scaffold, but target commands should include:
- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Gateway service unit/integration test command.
