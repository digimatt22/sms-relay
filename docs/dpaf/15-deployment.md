# Deployment

Status: Draft.

## Recommended MVP Path
Run a local Next.js + Postgres cloud hub for MVP testing, with up to 3 remote gateway appliances connecting to it through Cloudflare Tunnels. The dashboard lives at `https://sns.digicolony.net`. The first hosted target is Vercel with managed Postgres.

## Cloud Hub
Option A:
- Next.js app deployed to Vercel.
- Managed Postgres through a Vercel Marketplace provider such as Neon.

Option B:
- Next.js app deployed through AWS Amplify Hosting compute.
- Postgres on RDS or Aurora Postgres.
- Optional CloudWatch integration for longer-term operations.

## Gateway Appliance
- Raspberry Pi Zero 2 W with selected SIM7070G module for MVP.
- Wired or wireless network connectivity required.
- SIM7070G connected through the Raspberry Pi expansion header; assume GPIO/UART as primary and USB serial as fallback if supported.
- Runs as an OS-managed service with environment/config file for gateway ID, API key, hub URL, APN/modem settings, and log level.
- Assume Raspbian/Raspberry Pi OS is already installed.
- Provide installer at `https://sns.digicolony.net/install` suitable for a Homebrew-style command such as `curl https://sns.digicolony.net/install | bash`, if feasible.

## Secrets
- Admin auth provider secrets in cloud environment variables.
- Auth.js/NextAuth.js local database-backed admin credentials for MVP.
- Database connection string in server-only environment variables. Production
  RelayHub uses `relayhub_sms_runtime`, never the portal's `appuser`.
- Gateway API key stored on appliance with file permissions restricted to the service user.
- Gateway API key hash stored in Postgres.

PostgreSQL role passwords are global to the server cluster, not scoped per
database. Each Sheldon application therefore requires a unique runtime login
role. RelayHub's role has `CONNECT` only to `relayhub_sms`, `USAGE` on the
required schema, required DML on application tables, and required access to
application sequences. Matching default privileges are applied for the role
that owns future migration-created objects.

## Health And Readiness

- `GET /api/health`: database-independent liveness; returns
  `{"status":"ok"}`.
- `GET /api/ready`: executes `SELECT 1`; returns HTTP 200 with
  `{"status":"ready"}` or HTTP 503 with `{"status":"unavailable"}`.
- Database exceptions and credentials are never included in readiness output.
- Sheldon uses `/api/ready` as the release activation health path.

## Rollback
- Cloud app rollback through hosting provider deployment history.
- Database migrations must be reversible or explicitly marked irreversible.
- Gateway service update should preserve config and support restart without message loss.

## Out Of Scope
- SIM activation.
- Cellular plan/provider account management.
- Hardware purchasing.
- Custom appliance manufacturing.

## Local MVP Networking
Gateway devices must reach the local machine running the hub through Cloudflare Tunnels at `https://sns.digicolony.net` for MVP. LAN/VPN can remain fallback options.

## Provisioning
- Installer should install runtime dependencies, create a service user if needed, install the gateway package, write a config template, register a systemd service, and start/enable the service.
- Installer must avoid embedding secrets directly in the URL.
- Gateway API key should be passed interactively or written to a protected config file after install.
- Installer should target the TypeScript/Node gateway service on Raspberry Pi Zero 2 W.
