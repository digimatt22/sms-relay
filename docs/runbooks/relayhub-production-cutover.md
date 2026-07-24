# Relay Hub PostgreSQL Cutover Runbook

Status: review draft; no live operation authorized

This runbook moves Relay Hub from the shared PostgreSQL server to the
application-owned PostgreSQL 17 service declared in `sheldon.json`. Every gate
below is independent. Approval for one gate does not authorize a later gate.

## Preconditions

Do not begin a maintenance window until all of these are recorded:

- team-marketplace Sheldon Deploy 0.2.0 or later is published, read from the
  team marketplace, and passes a clean-install schema-2 smoke test;
- the release candidate was produced from one clean Git commit by
  `npm run release:candidate -- /absolute/empty/output`;
- the archive checksum, provenance, and team-marketplace package audit agree on
  that commit;
- the protected source backup location and restore target have enough space;
- the isolated restore drill, comparison, consent/STOP tests, and rollback
  rehearsal have passed;
- an independent outage-notification channel has been selected and a received
  test is recorded;
- the prior live release and unchanged source database remain available;
- a 20-minute maintenance window is approved, with a rollback decision no
  later than minute 10.

Never print or record environment values, database URLs, credentials, phone
numbers, or message bodies.

## Gate 1 — historical artifact cleanup

Optional and not required for cutover. Follow
`relayhub-historical-dump-cleanup.md` only after explicit cleanup approval.
Release directories and Docker build cache are separate targets and must not be
removed under dump-file approval.

## Gate 2 — create the application-owned database

Stop for explicit approval before creating the live PostgreSQL instance,
network, or persistent volume.

After approval, create PostgreSQL 17 at the current baseline patch level. Do
not change the major version. Confirm the volume name, ownership, capacity,
backup declaration, resource limits, internal-only network, liveness, and
readiness contract before continuing.

## Gate 3 — create roles and secrets

Stop for explicit approval before creating roles or changing server secrets.

After approval:

1. create the cluster bootstrap administrator;
2. create the non-superuser `relayhub_sms_owner` role with a connection limit
   of 5;
3. create the non-superuser, non-owning `relayhub_sms_runtime` role with a
   connection limit of 20;
4. create the `relayhub_sms` database owned by the owner role;
5. apply role timeouts and revoke public privileges;
6. store owner/migrator and runtime credentials separately;
7. verify the runtime connection cannot create or alter schema objects.

Do not point the application at the target yet.

## Gate 4 — fence production writes

Stop for explicit approval before changing `RELAYHUB_WRITE_FENCE`, recreating
the live application container, or otherwise stopping writes.

After approval, set `RELAYHUB_WRITE_FENCE=true` on the current application and
recreate only the approved application container. Verify:

- `GET /api/health` and `GET /api/ready` still succeed and include
  `x-relayhub-write-fence: active`;
- a safe authenticated mutation returns HTTP 503, `Retry-After: 60`, and the
  fence header before it reaches business logic;
- UI form mutations are also rejected;
- no worker can claim, send, acknowledge, or update queued work;
- database sessions and message/attempt/event counts remain stable during an
  observation interval.

If any write path remains active, keep the window closed and stop.

## Gate 5 — final backup and isolated restore

Stop for explicit approval before taking the production migration backup,
copying production data, or running migrations.

After approval:

1. capture a protected custom-format backup from the fenced source;
2. record its mode, size, SHA-256, PostgreSQL version, and object-list count
   without recording customer data;
3. restore it into the application-owned PostgreSQL instance;
4. run migrations separately with the owner/migrator credential;
5. apply runtime grants separately;
6. compare PostgreSQL major version, normalized schema digest, full migration
   ledger, protected row counts, and relationship checks;
7. prove the runtime role is non-owning and least-privilege;
8. run the non-sending authorized-message test and the missing-consent, STOP,
   invalid-credential, and unavailable-database failure tests.

Any mismatch keeps writes fenced and triggers rollback before cutover.

## Gate 6 — deploy the target application

Stop for explicit approval before deploying or recreating live containers.

After approval, deploy the audited exact-commit archive with
`RELAYHUB_WRITE_FENCE=true` and the target runtime database credential. Do not
run migrations as part of deployment. Verify container health, public
readiness, non-root execution, network isolation, connection ceilings, and the
active fence.

## Gate 7 — open writes

Stop for explicit approval before setting `RELAYHUB_WRITE_FENCE=false` or
recreating the target application container.

After approval, open writes and verify:

- one authorized SMS request is accepted through the approved test path;
- missing consent is rejected;
- a STOP-suppressed recipient is rejected;
- invalid credentials are rejected;
- queued, delivered, and historical records remain queryable;
- host-level and application monitoring are healthy.

Record the final release, image digests, target database identity, protected
counts, and timestamps.

## Rollback

Before the target accepts writes, the unchanged source database remains
authoritative. Keep the fence active, restore the prior runtime database
credential, and recreate the prior application release only after explicit
rollback approval. Then verify readiness before opening the fence. Never run
reverse migrations, reset either database, or delete the target volume as part
of application rollback.

If the target has accepted any write, immediately re-enable the fence and
capture both sides. Do not blindly point the application back to the source:
compare and reconcile post-cutover writes under a separately reviewed recovery
plan.

Rollback is mandatory by minute 10 if the remaining work cannot finish inside
the approved 20-minute window, or immediately for any schema, ledger, protected
count, relationship, runtime-role, consent, STOP, credential, readiness, or
fallback-alert failure.
