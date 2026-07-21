# RelayHub SMS Backup, Restore, And Deployment Runbook

## Scope

This runbook covers the current production target:
- Next.js hub on Vercel or local Node-compatible hosting
- Managed Postgres
- Raspberry Pi gateway appliances installed from `/install`

## Required Environment

Hub environment variables:

```bash
DATABASE_URL=postgres://...
AUTH_SECRET=...
AUTH_URL=https://sns.digicolony.net
NEXT_PUBLIC_APP_URL=https://sns.digicolony.net
RELAYHUB_PUBLIC_URL=https://sns.digicolony.net
INSTALLER_URL=https://sns.digicolony.net/install
RELAYHUB_WEBHOOK_SECRET=...
```

Gateway environment values:

```bash
RELAYHUB_HUB_URL=https://sns.digicolony.net
RELAYHUB_GATEWAY_KEY=...
RELAYHUB_SERIAL_DEVICE=/dev/serial0
RELAYHUB_SERIAL_BAUD_RATE=115200
RELAYHUB_CARRIER=Tello
RELAYHUB_APN=wholesale
```

## Deployment

Before deploy:

```bash
npm run deploy:check
```

Deploy the hub, then run migrations:

```bash
npm run db:migrate
```

To include migrations in the automated check when `DATABASE_URL` points at the intended database:

```bash
RUN_MIGRATIONS=1 npm run deploy:check
```

Rebuild the gateway package after appliance-code changes:

```bash
npm run gateway:package
```

The package is written to:

```text
public/gateway.tar.gz
```

## Post-Deploy Checks

Run:

```bash
npm run db:migrate
curl -X POST https://sns.digicolony.net/api/maintenance/run
curl -X POST https://sns.digicolony.net/api/alerts/process
curl -X POST https://sns.digicolony.net/api/callback-deliveries/process \
  -H "content-type: application/json" \
  -d '{"limit":25}'
```

Dashboard checks:
- `/messages` loads for the expected organization
- `/gateways` shows heartbeat for active appliances
- `/alerts` has no unexpected critical alerts
- `/callbacks` has no stuck repeated failures
- `/usage` rollups refresh successfully

## Backup

Managed Postgres should have provider-managed point-in-time recovery enabled.

Manual logical backup:

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --file="relayhub-$(date +%Y%m%d-%H%M%S).dump"
```

Recommended schedule:
- daily logical backup retained for 30 days
- provider PITR retained for at least 7 days
- pre-migration backup before schema changes

## Restore Drill

Create a fresh database and restore:

```bash
createdb relayhub_restore
pg_restore \
  --clean \
  --if-exists \
  --dbname="$RESTORE_DATABASE_URL" \
  relayhub-YYYYMMDD-HHMMSS.dump
```

Then validate:

```bash
DATABASE_URL="$RESTORE_DATABASE_URL" npm run db:migrate
DATABASE_URL="$RESTORE_DATABASE_URL" npm run build
```

Database checks:

```sql
select count(*) from organizations;
select count(*) from messages;
select count(*) from gateways;
select count(*) from api_client_keys where status = 'active';
select count(*) from gateway_keys where status = 'active';
```

## Rollback

Application rollback:
- redeploy the previous hub version
- do not roll back schema unless a restore is required
- disable new gateway commands if appliance behavior is suspect

Database rollback:
- prefer forward-fix migrations
- restore from pre-migration backup only if data corruption or destructive migration failure occurs

## Appliance Update

On a Raspberry Pi gateway:

```bash
curl -fsSL https://sns.digicolony.net/install | sudo bash
sudo systemctl restart relayhub-gateway
sudo journalctl -u relayhub-gateway -n 100 --no-pager
```

Verify:
- gateway starts
- modem initializes
- heartbeat appears in `/gateways`
- test message reaches carrier submission
- inbound reply uploads and deletes from modem storage

## Incident Checklist

Gateway offline:
- inspect `/alerts`
- inspect `/gateways/{id}`
- request diagnostics command
- request modem reset command
- check Pi logs with `journalctl`

Queue growing:
- inspect `/messages?status=queued`
- check gateway pool membership in `/routing`
- check gateway hourly caps and client limits
- process alerts

Webhook failures:
- inspect `/callbacks`
- retry a single callback
- verify client endpoint responds with `2xx`
- confirm webhook signature secret matches
