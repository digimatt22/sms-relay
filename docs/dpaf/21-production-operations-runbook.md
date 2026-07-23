# RelayHub SMS Production Operations Runbook

## Local Verification

Run these from the project root:

```bash
npm run db:migrate
npm run typecheck
npm test
npm run gateway:build
npm run build
```

When using the local Docker Postgres database:

```bash
DATABASE_URL=postgres://relayhub:relayhub@localhost:5433/relayhub_sms npm run db:migrate
```

## Maintenance Jobs

Run the maintenance job after deploy and then on a daily schedule:

```bash
curl -X POST https://sns.digicolony.net/api/maintenance/run
```

The job:
- rebuilds recent `daily_usage_rollups`
- keeps raw gateway logs and health for 90 days
- preserves longer-term aggregate usage

Dashboard path:
- `/usage`

## Callback Delivery Processing

Set `RELAYHUB_WEBHOOK_SECRET` in production to sign callback payloads. Signed requests include:
- `x-relayhub-timestamp`
- `x-relayhub-signature`

The signature is `sha256=<hmac>` over `{timestamp}.{rawJsonBody}`.

Run due callback retries on a short recurring schedule:

```bash
curl -X POST https://sns.digicolony.net/api/callback-deliveries/process \
  -H "content-type: application/json" \
  -d '{"limit":25}'
```

Dashboard path:
- `/callbacks`

Operators can retry an individual callback delivery from the dashboard or via:

```bash
curl -X POST https://sns.digicolony.net/api/callback-deliveries/{id}/retry
```

## Alert Evaluation

Run alert evaluation every 1-5 minutes:

```bash
curl -X POST https://sns.digicolony.net/api/alerts/process
```

Dashboard path:
- `/alerts`

Current rules:
- gateway offline
- repeated send failures
- queue depth above threshold
- stuck `sending` messages
- repeated callback delivery failures

## Gateway And Client Key Operations

Gateway key rotation:

```bash
curl -X POST https://sns.digicolony.net/api/gateways/{id}/rotate-key
```

Client key rotation:

```bash
curl -X POST https://sns.digicolony.net/api/clients/{id}/rotate-key
```

Disable a client:

```bash
curl -X POST https://sns.digicolony.net/api/clients/{id}/disable
```

Dashboard paths:
- `/gateways`
- `/clients`

## Gateway Commands

Operators can request gateway commands from `/gateways/{id}`. The appliance polls the hub for pending commands before normal message work.

Supported commands:
- `diagnostics`: reports gateway configuration, signal quality, buffered logs, and modem failure counters
- `reset_modem`: runs the configured modem hard reset recovery path
- `restart_service`: reports completion, then exits so systemd restarts the service
- `update_service`: downloads and stages the latest published gateway package, preserves `/etc/relayhub/gateway.env`, atomically swaps `/opt/relayhub-gateway`, and restarts the service

Gateway command API endpoints:

```bash
curl -X POST https://sns.digicolony.net/api/gateway/commands/claim \
  -H "authorization: Bearer $RELAYHUB_GATEWAY_KEY" \
  -H "content-type: application/json" \
  -d '{"limit":5}'

curl -X POST https://sns.digicolony.net/api/gateway/commands/{id}/complete \
  -H "authorization: Bearer $RELAYHUB_GATEWAY_KEY" \
  -H "content-type: application/json" \
  -d '{"status":"completed","result":{"ok":true}}'
```

## Routing

Dashboard path:
- `/routing`

Production routing now uses gateway pools:
- every gateway should belong to at least one pool
- every API client should have access to at least one pool
- the default pool controls where new API messages are routed
- gateways only claim messages from pools they belong to

## Organizations

Dashboard path:
- `/organizations`

Platform admins can create organizations from the dashboard. Creating an organization also creates that organization's default gateway pool and assigns the creator as an `org_admin`.

The selected organization is stored in a secure dashboard cookie. Primary dashboard pages and admin APIs use that organization context for:
- messages
- gateways
- clients
- routing pools
- inbox
- callbacks
- alerts
- usage
- logs

API-client authenticated requests use the API client's organization, not the dashboard cookie.

Dashboard users are invited from `/organizations`. The dashboard creates a time-limited invitation link that lets the recipient set their own password, then assigns one of:
- `platform_admin`
- `org_admin`
- `operator`
- `viewer`

Org admins can update or remove memberships from the same page. The MVP displays invitation links in the dashboard; SMTP delivery can be added later without changing the invitation data model.

## Rate Limits And Routing Policy

Dashboard paths:
- `/clients`
- `/gateways/{id}`

Client controls:
- hourly message limit
- daily message limit

Gateway controls:
- routing weight
- hourly send cap

The hub enforces client limits before accepting API-created messages. Gateways with an hourly send cap stop claiming messages once they reach that cap.

## Opt-Outs

Inbound STOP-style replies create active opt-outs scoped to the organization.

Blocked outbound sends return a clear API/dashboard error. Admin override is reserved for explicit workflows through message metadata and should be used only for operational testing or legally approved cases.
