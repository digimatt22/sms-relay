# PostgreSQL Runtime Role Isolation Execution Plan

Status: In progress.

Incident: 2026-07-24 shared `appuser` role password collision on Sheldon.

## Goal

Move RelayHub SMS to the dedicated `relayhub_sms_runtime` PostgreSQL login role,
make database readiness observable without weakening liveness checks, and prevent
RelayHub deployment or operations from reusing another Sheldon application's
runtime role.

## Non-Negotiable Data Safety

- Preserve all data in both `relayhub_sms` and the DigiColony Client Operations
  `appdb` database.
- Do not reset, seed, restore, truncate, or delete records during this recovery.
- Do not change `appuser`, its password, or the portal environment.
- Never print or commit database credentials.

## Repository Work

- [x] Record the incident and the PostgreSQL cluster-wide role/password rule.
- [x] Define `relayhub_sms_runtime` and its least-privilege grants.
- [x] Make `/api/health` database-independent.
- [x] Add database-aware `/api/ready` with generic failure responses.
- [x] Configure Sheldon deployment health checks to use `/api/ready`.
- [x] Add automated readiness success and safe-failure coverage.
- [x] Update deployment, project context, automation, recovery, and backlog docs.
- [x] Run tests, lint, type checking, production build, and Sheldon plan/preflight.

## Live Recovery Gates

Each state-changing operation requires Matthew's explicit confirmation
immediately before execution.

1. **Role creation:** create `relayhub_sms_runtime` without changing `appuser`;
   grant only `relayhub_sms` connection, schema usage, existing table/sequence
   access, and matching default privileges.
2. **Secret update:** change only the username and password in RelayHub's
   server-side `DATABASE_URL`, preserving host, port, database, query parameters,
   and URL encoding.
3. **Container recreation:** redeploy or recreate only RelayHub SMS.

Live status:

- [x] Gate 1 completed at 2026-07-24 13:20 UTC after explicit confirmation.
- [x] Gate 2 completed at 2026-07-24 13:46 UTC after explicit confirmation.
- [ ] Gate 3 pending explicit confirmation.

## Pre-Change Evidence

- [x] Capture protected record counts from both databases without exposing data.
- [x] Capture RelayHub and portal health/readiness behavior.
- [x] Confirm current database/object ownership needed for default privileges.
- [x] Confirm no other Sheldon environment uses `relayhub_sms_runtime`.

## Post-Change Validation

- [ ] RelayHub `/api/health` returns HTTP 200.
- [ ] RelayHub `/api/ready` returns HTTP 200 with `{"status":"ready"}`.
- [ ] A controlled RelayHub database-backed read workflow succeeds.
- [ ] RelayHub logs have no PostgreSQL authentication failures.
- [ ] Portal `/api/health` remains HTTP 200.
- [ ] Portal sign-in with controlled invalid credentials reaches the expected UI.
- [ ] Protected record counts in both databases are unchanged.
- [ ] No other Sheldon environment uses `relayhub_sms_runtime`.

## Rollback

If RelayHub fails after the secret update, restore only RelayHub's prior
server-side `DATABASE_URL` and recreate only its container. Do not change
`appuser`, the portal environment, or either database's records. Retain the new
role for diagnosis unless an operator separately approves removal after proving
it owns no objects and no environment references it.

## Pull Request

- Branch: `codex/relayhub-postgres-role-isolation`
- Base: `main`
- Commit and push only after repository validation passes.
- Open a pull request containing validation evidence and clearly mark live
  recovery steps as completed or pending authorization.
