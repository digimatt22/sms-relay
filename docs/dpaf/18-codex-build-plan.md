# Codex Build Plan

Status: Draft, ready for human review.

## Project Goal
Build RelayHub SMS: a locally runnable Next.js + Postgres SMS gateway hub with an admin dashboard at `https://sns.digicolony.net` and up to 3 remote Raspberry Pi Zero 2 W gateway appliances connected over Cloudflare Tunnels for outbound SIM7070G SMS sending. The installer endpoint is `https://sns.digicolony.net/install`. The first hosted target is Vercel with managed Postgres.

## Files To Read First
- `docs/dpaf/PRD.md`
- `docs/dpaf/03-discovery-notes.md`
- `docs/dpaf/08-database-design.md`
- `docs/dpaf/09-api-specification.md`
- `docs/dpaf/12-frontend-architecture.md`
- `docs/dpaf/13-backend-architecture.md`
- `docs/dpaf/14-testing-strategy.md`
- `docs/dpaf/15-deployment.md`
- `docs/dpaf/adr/`

## Phase 0: Repository Scaffold And Tooling
Create the application structure, package scripts, lint/typecheck/test setup, local Postgres development setup, environment examples, and initial docs.

Acceptance:
- Local dev server starts.
- Lint/typecheck/test commands exist.
- Environment variables are documented.

## Phase 1: Cloud Hub Data Model
Implement Postgres schema/migrations for messages, attempts, gateways, logs, health, and admin users or auth mapping.

Acceptance:
- Migrations create required tables/indexes.
- Seed script creates an admin/dev gateway fixture.
- Tests cover message lifecycle state constraints where practical.

## Phase 2: Message Admin API And Dashboard Queue
Implement message insertion, queue list, message detail, and dashboard create-message form.

Acceptance:
- Admin can create a message from dashboard.
- API can create a message with flexible metadata.
- Queue and detail pages show status, attempts, claim fields, metadata, and errors.

## Phase 3: Gateway Management, Auth, Health, And Logs
Implement Auth.js/NextAuth.js local admin authentication, gateway records, static API key hashing, key create/rotate/revoke, heartbeat endpoint, redacted log ingestion, gateway list/detail pages.

Acceptance:
- Admin can create a gateway and receive a one-time key.
- Gateway API requests authenticate with the key.
- Disabled gateways cannot use gateway endpoints.
- Health/logs appear in dashboard.

## Phase 4: Claim, Retry, And Failover
Implement central message claim endpoint, 2-minute leases, expired-claim reassignment, retry scheduling, 3-attempt dead-letter behavior, and concurrency tests.

Acceptance:
- Concurrent claim attempts do not return the same active claim.
- Expired claims can be reassigned.
- Failed messages retry with exponential backoff and then dead-letter.

## Phase 5: Gateway Appliance Service With Mock Modem
Implement a TypeScript/Node gateway service for Raspberry Pi Zero 2 W hardware that loads config, heartbeats every 1-5 minutes, claims messages, uses a mock modem adapter, reports status/logs, and handles temporary hub/network failures. Phone numbers must be redacted to last 4 digits; SMS body may be included in MVP logs.

Acceptance:
- Gateway service can process messages end-to-end with mock modem.
- Service logs and health appear in cloud dashboard.
- Config supports hub URL, gateway key, modem mode, and log level.

## Phase 6: SIM7070 Integration
Implement SIM7070 adapter for outbound SMS and carrier-submitted result mapping.

Acceptance:
- Integration path can send a real outbound SMS on selected hardware.
- SIM7070G is accessed through the Raspberry Pi expansion header using GPIO/UART assumption; USB serial is fallback if supported.
- Modem failures are reported and retried.
- Reconnect behavior is documented and tested manually.

## Phase 7: Deployment And Operations
Add deployment docs, appliance provisioning installer, smoke tests, and operational runbook.

Acceptance:
- Cloud hub deployment path is documented.
- Gateway appliance setup supports a Homebrew-style installer command when feasible.
- Installer endpoint is `https://sns.digicolony.net/install`.
- Installer assumes Raspbian/Raspberry Pi OS is already installed.
- Manual smoke test covers 2-3 gateways, failover, logs, and dashboard visibility.

## Open Questions That Should Not Block Phase 0
- No known non-blocking open questions affect Phase 0.
