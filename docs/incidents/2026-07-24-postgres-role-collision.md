# 2026-07-24 Sheldon PostgreSQL Role Collision

Status: Repository remediation in progress; live role migration pending gated
operations.

## Impact

DigiColony Client Operations at `portal.digicolony.net` and RelayHub SMS at
`sns.digicolony.net` connect to the same PostgreSQL server at
`172.18.0.2:5432`. The portal uses `appdb`; RelayHub uses `relayhub_sms`.
Both applications were configured with the PostgreSQL login role `appuser`, but
their `DATABASE_URL` values contained different passwords.

Restoring `appuser` to the canonical password from
`/srv/dev-stack/secrets/postgres_password` restored the portal and caused
RelayHub to fail authentication. The canonical password file was unchanged and
matched the portal environment.

## Root Cause

PostgreSQL login roles and their passwords belong to the entire PostgreSQL
cluster, not to an individual database. `appuser` therefore has one password
across both `appdb` and `relayhub_sms`. Assigning different passwords to the same
role in two application environments cannot isolate the applications: changing
the role password for either database changes it globally.

RelayHub's environment drifted from its deployment documentation and contained
a different password for the shared role. PostgreSQL statement and connection
logging were disabled, so the exact password-changing command, process, or agent
cannot be attributed from available evidence.

## Data Safety

No database reset, seed, restore, truncation, or record deletion is authorized
as part of this recovery. Both applications' data must be preserved. The portal
environment and the `appuser` password must remain unchanged.

## Remediation

- RelayHub's only normal runtime login role is `relayhub_sms_runtime`.
- The role may connect only to `relayhub_sms` and receives only the schema,
  table DML, and sequence privileges required by the application.
- RelayHub runtime configuration rejects any other database username.
- `/api/health` is database-independent liveness.
- `/api/ready` performs `SELECT 1` and reports only `ready` or `unavailable`.
- Sheldon activates a release only when `/api/ready` succeeds.
- Role creation, RelayHub secret editing, and RelayHub container recreation are
  separately confirmed live operations.

## Prevention

Every Sheldon application must have a unique PostgreSQL runtime login role.
Database ownership/migration credentials must be separate from normal runtime
credentials when production privileges are tightened. No application may
reuse, rotate, or repair another application's role or canonical password.

Validation evidence and the exact live timeline are tracked in
`docs/dpaf/29-postgres-role-isolation-execution-plan.md`.
