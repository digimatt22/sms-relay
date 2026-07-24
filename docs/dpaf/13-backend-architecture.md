# Backend Architecture

Status: Draft.

## Recommended Architecture
Use a cloud hub plus remote gateway appliance model.

## Cloud Hub
- Next.js App Router dashboard and route handlers.
- Postgres database.
- Auth.js/NextAuth.js admin session authentication with local database-backed credentials for MVP.
- Gateway API-key authentication.
- Central message claim/lease coordinator.
- Retry scheduler implemented through claim eligibility and periodic cleanup.
- Log and health ingestion endpoints.

## Gateway Appliance
- MVP target: Raspberry Pi Zero 2 W with the selected SIM7070G Pi HAT-class module.
- Rationale: easier TLS, OS service management, log buffering, package updates, local debugging, and SIM7070 integration than ESP32 custom hardware.
- ESP32 custom hardware remains a future target after the cloud API and gateway protocol stabilize.

## Gateway Service Responsibilities
- Load gateway config and API key.
- Heartbeat to central API.
- Poll/claim messages.
- Send SMS through SIM7070.
- Mark carrier-submitted status after modem/carrier submission response.
- Report failures for retry/dead-letter.
- Buffer logs locally during temporary network loss.
- Reconnect to modem and central API after transient failures.

## Retry And Failover
- Claim timeout: 2 minutes.
- Retries: up to 3 attempts.
- Backoff: exponential.
- Final state after retry exhaustion: `dead_lettered`.
- Stuck messages with expired claims become eligible for another gateway.
- Heartbeat interval: configurable 1-5 minute range.
- Dashboard health only for MVP; external alerts are future scope.

## Security
- Gateway static API keys are hashed at rest.
- Gateway API keys are scoped to one gateway.
- Admin can rotate/revoke gateway keys.
- Gateway endpoints reject disabled gateways.
- Store only redacted modem traces if they may contain phone numbers or message body.
- RelayHub's production database login is the dedicated
  `relayhub_sms_runtime` role. PostgreSQL roles are cluster-global, so runtime
  roles cannot be shared across Sheldon applications even when they connect to
  different databases.
- The runtime connection rejects any username other than
  `relayhub_sms_runtime`. Migration/owner access is an operator concern and is
  not a normal application runtime credential.
- `/api/health` is database-independent liveness. `/api/ready` executes only
  `SELECT 1`, returns a generic 503 on failure, and is the deployment activation
  probe.

## Stack Decision
Recommended MVP: Next.js + Postgres, deployable locally first and hosted on Vercel with managed Postgres later.

AWS-native alternative: AWS Amplify Hosting for Next.js SSR with RDS/Postgres or Aurora Postgres, plus CloudWatch for logs if deeper AWS operations are preferred. AWS documentation states Amplify Hosting compute supports deploying Next.js SSR apps and manages the required SSR resources.

Vercel alternative: Vercel-hosted Next.js with a Marketplace Postgres provider such as Neon. Vercel documentation states new projects should use Marketplace Postgres integrations because the old Vercel Postgres product is no longer available.

## Runtime Decision
Gateway service should use TypeScript/Node for MVP. Python remains a future fallback only if SIM7070 integration proves materially more reliable in Python.

## Open Questions
- No blocking backend questions remain. Primary SIM7070G connection is Raspberry Pi expansion header using GPIO/UART assumption; USB serial is fallback if supported.
