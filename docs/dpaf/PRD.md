# PRD: RelayHub SMS

Status: Implemented foundation; production qualification in progress.

## Purpose
RelayHub SMS is a cloud-coordinated outbound SMS gateway platform. It lets admins insert and monitor outbound SMS messages through a dashboard/API while remote gateway appliances claim, send, and report message status through SIM7070 modules.

## Source Inputs
- `SMS Gateway SOW.pages`
- Discovery interviews on 2026-07-03
- DPAF docs under `docs/dpaf/`

## Goals
- Send outbound SMS through SIM7070 modules.
- Support 2-3 remote gateways for MVP.
- Prevent duplicate active claims with best-effort duplicate delivery protection.
- Reassign stuck messages after timeout.
- Provide a dashboard/operator UI that can run locally for MVP and deploy to Vercel later.
- Keep the architecture scalable for future load balancing.

## Non-Goals
- Guaranteed exactly-once delivery.
- SIM activation, cellular plans, provider account management, or hardware purchasing.
- Custom ESP32 appliance manufacturing in MVP.
- Customer-facing multi-role portal in MVP.

## Users
- MVP admin: internal operator who creates test/production messages, watches queue state, monitors gateways, reviews logs, and manages gateway keys.
- Future roles: operator and read-only users.

## MVP Requirements
1. Admin can create an outbound SMS from the dashboard.
2. External clients or admins can insert a message through the API.
3. Message insert supports `to`, `body`, `priority`, `scheduledAt`, `idempotencyKey`, flexible `metadata`, and `callbackUrl`; customer/account references live in `metadata` for MVP.
4. Gateway appliances authenticate with static per-gateway API keys.
5. Gateway appliances claim messages through the central API.
6. Claimed messages receive a lease with a 2-minute timeout.
7. A stuck/expired claim can be reassigned to another gateway.
8. Gateway sends SMS through SIM7070.
9. Carrier-submitted means accepted by the modem/carrier; handset delivery is tracked separately when a carrier report is available.
10. Failed sends retry up to 3 times with exponential backoff, then dead-letter.
11. Gateway health and logs are sent to the central API.
12. Dashboard shows queue, message detail, gateway fleet status, health, and logs.
13. Central logs are retained for 90 days.
14. MVP hub runs locally and supports up to 3 connected gateway devices.
15. Logs redact phone numbers while preserving last 4 digits.
16. Production runtime database access uses the dedicated
    `relayhub_sms_runtime` role; RelayHub never uses or changes another
    application's PostgreSQL role.
17. `/api/health` reports process liveness without database access, while
    `/api/ready` confirms database usability without exposing errors.

## Recommended Architecture
- Hub: Next.js App Router + Postgres, locally runnable for MVP and Vercel/managed Postgres as first hosted target.
- Dashboard: admin-only MVP UI with future role expansion.
- Dashboard auth: Auth.js/NextAuth.js with local database-backed admin credentials for MVP; Auth0 can be added later.
- API: JSON over HTTPS.
- Gateway auth: static API key per gateway, hashed at rest.
- Gateway appliance: off-the-shelf Raspberry Pi-class Linux hardware with SIM7070 Pi HAT module.
- Gateway appliance target: Raspberry Pi Zero 2 W with selected SIM7070G module.
- Gateway runtime: TypeScript/Node for MVP.
- Local connectivity: Cloudflare Tunnels expose the locally running hub to gateway appliances.
- Dashboard URL: `https://sns.digicolony.net`.
- Installer URL: `https://sns.digicolony.net/install`.
- SIM7070G connection: Raspberry Pi expansion header with GPIO/UART assumption; USB serial fallback if supported.

## Data Model
Primary entities:
- Message
- Message attempt
- Delivery receipt
- Conversation thread
- Platform event and API-key webhook subscription
- Gateway
- Gateway API key metadata
- Gateway health sample
- Gateway log event
- Admin user

Detailed draft schema is in `08-database-design.md`.

## API
Admin API:
- Create/list/view/cancel/requeue messages.
- Create/list/view gateways.
- Rotate/revoke gateway keys.
- View logs and health.

Gateway API:
- Heartbeat.
- Log ingestion.
- Claim message.
- Start attempt.
- Mark carrier-submitted.
- Mark failed.

Detailed draft API is in `09-api-specification.md`.

## Acceptance Criteria
- Admin can create a message in the dashboard with flexible metadata.
- A gateway can claim and send a message through a mock modem path.
- A real SIM7070 integration path can mark a message carrier-submitted.
- Two or three gateways polling concurrently do not receive the same active claim.
- If a claimed message is not completed within the lease timeout, another gateway can claim it.
- Failures retry up to 3 times and then dead-letter.
- Gateway health and logs appear in the dashboard.
- Logs are retained for 90 days.
- Build includes setup documentation for the cloud hub and gateway appliance.
- MVP includes appliance provisioning. Assume Raspbian/Raspberry Pi OS is already installed.
- Provisioning supports a Homebrew-style installer command such as `curl https://sns.digicolony.net/install | bash` where feasible.
- SMS body is visible in the admin UI.
- SMS body may be included in MVP logs.

## Risks
- SMS delivery semantics vary by carrier and modem; a delivery-confirmed state is only as authoritative as the carrier receipt.
- Best-effort duplicate prevention does not eliminate every carrier/network duplicate scenario.
- Static API keys need disciplined rotation/revocation.
- PostgreSQL role passwords are cluster-global. Reusing one login role across
  databases couples unrelated applications and can cause cross-application
  outages when either credential is rotated.
- Python remains a future fallback only if SIM7070 integration proves materially more reliable outside TypeScript/Node.

## Open Questions
- No blocking MVP kickoff questions remain.
