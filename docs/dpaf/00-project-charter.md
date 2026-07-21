# Project Charter

## Purpose
Kick off the DPAF specification for the RelayHub SMS project.

## Source Inputs
- `SMS Gateway SOW.pages`
- User-provided goals: SIM7070 SMS sending, multiple gateways, duplicate prevention, automatic failover, future load balancing.

## Facts
- The project is an SMS gateway system with locally runnable central services for MVP, a Vercel/managed-Postgres hosted path, and remote gateway appliances.
- `RelayHub SMS` is the internal working project name.
- MVP is outbound SMS only.
- A dashboard/operator UI is required for MVP.
- The project must create the database structure and central API.
- The central API must support inserting a message to be sent.
- SMS messages are retrieved from the central API by gateway appliances.
- SMS messages are sent through SIM7070 modules.
- Delivery status, logs, and health should be written back to the central API.
- Multiple gateway appliances may operate in different locations.
- The database, dashboard, API, logs, and health views should be cloud hosted.
- Gateway appliances may be required to have wired or wireless internet access for central hub communication.

## Decisions
- Generated DPAF docs live in `docs/dpaf/`.
- Discovery happens before PRD compilation.
- Do not constrain the architecture to Raspberry Pi or Python solely because the original SOW mentioned them.
- Successful delivery for MVP means carrier submitted.
- Best-effort duplicate prevention is acceptable for MVP.
- Gateways should claim messages through a central API.
- Automatic failover means reassigning stuck messages after a timeout.
- Static API keys per gateway are the preferred starting auth model unless architecture review identifies a better easy-to-manage option.
- Vercel with managed Postgres is the preferred hosted cloud target.
- MVP cloud services must also run locally so up to 3 remote gateway devices can connect during testing.
- Dashboard authentication will use Auth.js/NextAuth.js with local database-backed admin credentials for MVP, with Auth0 as a future option.
- Gateway appliance service should use TypeScript/Node for MVP.
- MVP appliance hardware is off-the-shelf Raspberry Pi-class hardware with a SIM7070 Pi HAT module.
- Selected modem module is the Amazon-listed SIM7070G module at `https://www.amazon.com/dp/B0892L2RWS`.
- Planned appliance is Raspberry Pi Zero 2 W-class hardware.
- Local hub access for appliances will use Cloudflare Tunnels.
- SMS body is visible in the admin UI.
- SMS body is allowed in MVP logs.
- MVP includes appliance provisioning assuming Raspbian/Raspberry Pi OS is already installed.
- Provisioning installer URL is `https://sns.digicolony.net/install`.
- Dashboard URL is `https://sns.digicolony.net`.
- SIM7070G primary connection is via Raspberry Pi expansion header using GPIO/UART assumption; USB serial is fallback if exposed/supported.
- Gateway heartbeat should be configurable in the 1-5 minute range.
- Phone numbers must be redacted in logs, preserving only the last 4 digits for reference.
- Dashboard-only health is sufficient for MVP.

## Assumptions
- Gateway appliances will run a local service that can reach the central cloud API over a standard network connection.
- SIM7070 Pi HAT remains the initial modem target.

## Open Questions
- No blocking MVP kickoff questions remain. See `17-open-questions.md`.
