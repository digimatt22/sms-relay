# RelayHub SMS Backup, Restore, And Deployment Runbook

## Scope

This runbook covers the Sheldon production target:
- schema-2 Next.js application service
- application-owned PostgreSQL 17 service and persistent volume
- Raspberry Pi gateway appliances installed from `/install`

## Required Environment

Hub environment variables:

```bash
DATABASE_URL=postgres://relayhub_sms_runtime:...@172.18.0.2:5432/relayhub_sms
MIGRATION_DATABASE_URL=postgres://relayhub_sms_owner:...@postgres:5432/relayhub_sms
AUTH_SECRET=...
AUTH_URL=https://sns.digicolony.net
NEXT_PUBLIC_APP_URL=https://sns.digicolony.net
RELAYHUB_PUBLIC_URL=https://sns.digicolony.net
INSTALLER_URL=https://sns.digicolony.net/install
RELAYHUB_WEBHOOK_SECRET=...
```

Both URLs are server-only and must be stored in separately scoped protected
secrets. The application receives only `DATABASE_URL`; the separately
authorized migration process receives only `MIGRATION_DATABASE_URL`. Preserve
URL encoding and never print either value.
RelayHub rejects normal runtime URLs whose decoded username is not
`relayhub_sms_runtime`.

Gateway environment values:

```bash
RELAYHUB_HUB_URL=https://sns.digicolony.net
RELAYHUB_GATEWAY_KEY=...
RELAYHUB_SERIAL_DEVICE=/dev/serial0
RELAYHUB_SERIAL_BAUD_RATE=115200
RELAYHUB_CARRIER=Tello
RELAYHUB_APN=wholesale
```

## Production Runtime Role Contract

PostgreSQL roles are cluster-global. A password belongs to a role, not to each
database that role can access. RelayHub must never use or alter the portal's
`appuser` role.

The dedicated container bootstraps with `relayhub_sms_cluster_admin`, then
creates the non-superuser `relayhub_sms_owner` owner/migrator and the
least-privilege runtime role through a privileged, server-local PostgreSQL
session. Supply passwords through protected server-side secret files; never put
them in shell history, command output, a repository file, or a deployment
archive.

The required SQL contract is:

```sql
CREATE ROLE relayhub_sms_runtime
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  CONNECTION LIMIT 20;

ALTER ROLE relayhub_sms_runtime SET statement_timeout = '30s';
ALTER ROLE relayhub_sms_runtime SET lock_timeout = '5s';
ALTER ROLE relayhub_sms_runtime
  SET idle_in_transaction_session_timeout = '30s';

REVOKE ALL ON DATABASE relayhub_sms FROM PUBLIC;
GRANT CONNECT ON DATABASE relayhub_sms TO relayhub_sms_runtime;

\connect relayhub_sms
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO relayhub_sms_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO relayhub_sms_runtime;
GRANT USAGE, SELECT, UPDATE
  ON ALL SEQUENCES IN SCHEMA public
  TO relayhub_sms_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE relayhub_sms_owner
  IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO relayhub_sms_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE relayhub_sms_owner
  IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES
  TO relayhub_sms_runtime;
```

The dedicated instance uses `relayhub_sms_owner` as its verified owner and
migrator. Default privileges apply to objects created by that specific owner;
applying them for an unrelated administrator does not protect future
migrations. The runtime role receives no schema creation, DDL,
superuser, role-management, or database-creation privileges and receives no
application-data privileges in `appdb`.

## Credential Collision Recovery

This procedure preserves RelayHub and portal data. Do not reset, seed, restore,
truncate, or delete records.

### Pre-Change Evidence

1. Record protected table counts in `relayhub_sms` and `appdb`.
2. Record database and object owners used by RelayHub migrations.
3. Confirm `relayhub_sms_runtime` is not referenced by another Sheldon
   application environment.
4. Confirm portal health and its expected invalid-credentials sign-in behavior.
5. Confirm RelayHub liveness, readiness, and recent authentication errors.

Do not print environment values. Inspect only variable names, decoded URL
components other than the password, role metadata, grants, counts, status
codes, and redacted logs.

### Gate 1: Role Creation

Obtain Matthew's explicit confirmation immediately before creating the role or
granting privileges. Create `relayhub_sms_runtime` without changing `appuser`.
Reuse RelayHub's existing distinct protected password only through a
server-local, non-printing transfer. If that cannot be done, generate a unique
password with a cryptographically secure generator and keep it server-side.

Verify the role attributes and effective grants without displaying its password
verifier.

### Gate 2: RelayHub Secret Update

Obtain a second explicit confirmation immediately before editing
`~/.config/sheldon/secrets/relayhub-sms.env`.

Change only the decoded username and password in `DATABASE_URL`. Preserve its
scheme, host, port, database name, query string, and correct URL encoding. Keep
the file mode `0600`. Do not modify the portal environment, `appuser`, or
`/srv/dev-stack/secrets/postgres_password`.

### Gate 3: RelayHub Container Recreation

Obtain a third explicit confirmation immediately before recreating or
redeploying. Recreate only the RelayHub application container. Do not recreate
the PostgreSQL or portal containers.

### Post-Change Validation

Capture exact timestamps, release/container identifiers, HTTP status codes,
generic response bodies, count comparisons, and redacted log results:

1. RelayHub `/api/health` returns HTTP 200 with `{"status":"ok"}`.
2. RelayHub `/api/ready` returns HTTP 200 with `{"status":"ready"}`.
3. A controlled, read-only RelayHub database-backed request succeeds.
4. RelayHub logs contain no new authentication failures.
5. `portal.digicolony.net/api/health` remains HTTP 200.
6. A controlled portal invalid-credentials sign-in reaches the expected UI.
7. Protected record counts in both databases match the pre-change snapshot.
8. No other Sheldon environment references `relayhub_sms_runtime`.

## Migration And Deployment

Before either operation:

```bash
npm run deploy:check
npm run sheldon:validate
```

Migrations are a separate one-shot process and are never part of application
deployment. After backup/restore evidence and explicit migration authority:

```bash
npm run db:migrate:production
```

Stop again for explicit deployment/container-recreation authority before
activating an application release. Application rollback never reruns a
migration and never downgrades the database.

Rebuild the gateway package after appliance-code changes:

```bash
npm run gateway:package
```

The package is written to:

```text
public/gateway.tar.gz
```

## Post-Deploy Checks

After a separately authorized migration and deployment, run:

```bash
curl -fsS https://sns.digicolony.net/api/health
curl -fsS https://sns.digicolony.net/api/ready
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

Write logical backups only to a pre-created protected directory outside the
repository, release tree, Docker context, and build cache. The directory and
file must be mode `0700` and `0600`, respectively. The schema-2 backup hook
implements this command:

```bash
umask 077
pg_dump "$SOURCE_BACKUP_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$PROTECTED_BACKUP_PATH"
pg_restore --list "$PROTECTED_BACKUP_PATH"
```

Recommended schedule:
- daily logical backup retained for 30 days
- off-host protected copy or snapshot under a separately reviewed policy
- pre-migration backup before schema changes

## Restore Drill

Create an isolated PostgreSQL 17 instance with a fresh volume and restore as
`relayhub_sms_owner`:

```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --exit-on-error \
  --dbname="$ISOLATED_MIGRATION_DATABASE_URL" \
  "$PROTECTED_BACKUP_PATH"
```

Then validate:

```bash
MIGRATION_DATABASE_URL="$ISOLATED_MIGRATION_DATABASE_URL" \
  npm run db:migrate:production
node scripts/database-compare.mjs
```

Compare PostgreSQL major version and compatibility metadata, migration filenames,
schema fingerprints, protected row counts, relationship checks, role
attributes, ownership, and runtime grants. Exercise authorized message creation
with a non-sending adapter plus expected missing-consent, STOP, invalid-key, and
database-unavailable failures. Record elapsed backup, restore, compare, and
smoke durations for the maintenance-window estimate.

## Rollback

Application rollback:
- redeploy the previous hub version
- do not roll back schema unless a restore is required
- disable new gateway commands if appliance behavior is suspect

Credential-isolation rollback:
- restore only RelayHub's prior protected `DATABASE_URL`
- recreate only the RelayHub container
- do not change `appuser`, the portal environment, the canonical portal
  password file, or either database's records
- retain `relayhub_sms_runtime` for diagnosis unless a separate approved review
  proves it owns no objects and no environment references it
- repeat both applications' health, sign-in, log, role-inventory, and protected
  count checks

Database rollback:
- prefer forward-fix migrations
- restore from pre-migration backup only if data corruption or destructive migration failure occurs
- for the instance move, fence writes and point Relay Hub back to the unchanged
  source database if cutover verification fails; do not delete either instance
  until closeout and separate retention approval

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
