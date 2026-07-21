# Discovery Notes

## Purpose
Capture source-derived facts, assumptions, and interview gaps before requirements and architecture are finalized.

## Source Inputs
- `SMS Gateway SOW.pages`
- User kickoff request dated 2026-07-03

## SOW Facts
- Build a Python-based software application for Raspberry Pi.
- Retrieve SMS messages from an API or database.
- Send SMS messages through the SIM7070 module.
- Update API/database with delivery status and timestamp.
- Prevent race conditions and duplicate messages when multiple devices are in use.
- Provide configurable retry logic for failed delivery.
- Use a modular design for future API/database compatibility.
- Provide mock API and database for testing.
- Configure Raspberry Pi with SIM7070 modules.
- Support multiple network providers through APN configuration.
- Handle network connectivity issues with automatic reconnection.
- Provide logging and debugging utilities.
- Provide installation/setup guide, API/database configuration details, code documentation, and example environment configs.

## User-Stated Goals
- Send SMS messages through SIM7070 modules.
- Support multiple gateways.
- Prevent duplicate SMS delivery.
- Automatic failover.
- Future load balancing.

## Partially Recovered SOW Content
The embedded SOW text includes a `What's Not Included` section, estimated effort/timeline, assumptions/constraints, pricing/billing, and acceptance criteria, but the exact text after the section heading is not fully recoverable from the Pages package preview. Treat any exclusions beyond visible text as unconfirmed until Matthew clarifies.

## Decisions
- Start from discovery.
- Do not compile a final PRD until missing context is addressed.
- Use `RelayHub SMS` as the internal working project name.
- MVP is outbound SMS only.
- A dashboard/operator UI is required for MVP.
- The project must define and create the database structure and central API.
- The central API must support inserting outbound messages.
- Delivery success for MVP means carrier submitted.
- Best-effort duplicate prevention is acceptable for MVP.
- Gateways should claim messages through a central API.
- Automatic failover means reassigning a stuck message after timeout.
- Do not limit the design to Raspberry Pi or Python.
- Static API keys per gateway are the preferred initial auth model, subject to architecture review.
- Logs and health should flow to the central API and power the dashboard/operator panel.
- Database, dashboard, logs, and central API should be cloud hosted.
- Remote appliances may be required to have wired or wireless internet access to the central hub.
- Preferred MVP hub stack is Next.js + Postgres.
- AWS-native remains a future alternate architecture path, not an MVP blocker.
- Preferred hosted deployment target is Vercel with managed Postgres.
- MVP cloud services must run locally for development/testing, with up to 3 remote gateway devices connecting to the local hub.
- Dashboard authentication should use Auth.js/NextAuth.js with local database-backed admin credentials for MVP.
- Auth0 is a future authentication expansion option.
- Dashboard access is admin-only for MVP, with future role expansion.
- Message insertion should include `to`, `body`, priority, scheduled time, customer/account, idempotency key, metadata, and callback URL support.
- Message schema should support flexible per-use-case metadata.
- Operators must be able to create/send messages from the dashboard as a major testing surface.
- MVP should prove 2-3 gateways.
- MVP throughput target is approximately 50 SMS/hour, with a scalable design.
- Initial retry/timeout policy: 2-minute claim timeout, up to 3 retries, exponential backoff, then dead-letter.
- Appliance options should be evaluated, with likely preference for Raspberry Pi or ESP32 custom hardware.
- MVP appliance hardware is off-the-shelf Raspberry Pi-class hardware with a SIM7070 Pi HAT module.
- Gateway runtime for MVP is TypeScript/Node.
- Selected SIM7070G module: `https://www.amazon.com/dp/B0892L2RWS`.
- Planned device: Raspberry Pi Zero 2 W.
- Cloud hub will be reachable from appliances over Cloudflare Tunnels during local MVP testing.
- SMS body should be visible in the admin UI.
- SMS body may be included in MVP logs.
- MVP includes appliance OS/provisioning work. Assume Raspbian/Raspberry Pi OS is already installed.
- Provisioning installer endpoint is `https://sns.digicolony.net/install`.
- Dashboard endpoint is `https://sns.digicolony.net`.
- SIM7070G should connect through the Raspberry Pi expansion header; assume GPIO/UART as the safe primary path, with USB serial as fallback if supported.
- SIM activation, cellular plans, provider accounts, and hardware purchasing are out of scope.
- Central log retention target is 90 days.
- Gateway heartbeat should be reduced from the draft 30 seconds to a configurable 1-5 minute range.
- Logs must redact phone numbers while preserving the last 4 digits for troubleshooting reference.
- Dashboard-only gateway health is sufficient for MVP; alerts are future scope.

## Assumptions
- SIM7070 Pi HAT remains the initial modem target.
- A central API/database will coordinate message leasing, delivery status, retries, logs, health, and duplicate prevention.
- Another healthy gateway can claim expired/stuck work after a timeout.
- The dashboard will be an internal operator tool unless external/customer access is later confirmed.
- Raspberry Pi-class Linux hardware is the MVP appliance target because it lowers risk for TLS, service management, logging, local debugging, and SIM7070 integration.
- ESP32 custom hardware should be preserved as a future appliance option after the cloud/gateway protocol stabilizes.

## Risks
- Duplicate SMS delivery can occur if message claiming, retries, modem errors, and status updates are not designed as one workflow.
- SIM7070 delivery confirmation behavior may vary by carrier and modem firmware.
- Hardware/runtime optionality reduces premature constraints but delays some implementation choices.
- Switching from Pi Zero W to Pi Zero 2 W removes the ARMv6 Node runtime concern for the TypeScript/Node gateway.
- Cellular provider limits and SIM account management can affect reliability independent of software.
- Static API keys are simple to operate but need rotation, revocation, scoping, and audit design.
- Including SMS body in logs is acceptable for MVP but increases privacy exposure; future phases should add stricter log redaction controls.

## Interview Status
Second discovery response captured. Requirements and architecture draft can proceed with remaining open questions marked non-blocking unless they affect implementation.
