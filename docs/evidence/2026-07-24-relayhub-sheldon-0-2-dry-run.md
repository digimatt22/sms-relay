# Relay Hub Sheldon 0.2.0 Dry-Run Evidence

Date: 2026-07-24
Result: passed
Production cutover: not performed

## Source

- Live release observed: `20260724T181648Z`.
- Source database: `relayhub_sms`.
- Source runtime role: `relayhub_sms_runtime`.
- PostgreSQL: `17.10`, version number `170010`.
- Logical backup method: PostgreSQL 17.10 `pg_dump`, custom format,
  `--no-owner --no-acl`, streamed directly to a protected local file.
- Backup file mode: `0600`.
- Backup size: `602,080` bytes.
- Backup SHA-256:
  `00f9b61e2906bd99ebfbf33febf0c102b235cbd8a3b15e1e918b5f8dde82e3bf`.
- `pg_restore --list`: passed, 354 entries.
- Production writes were not stopped. The backup is dry-run evidence, not the
  final cutover backup.

The protected backup and raw evidence remain outside the repository under
`/private/tmp`. They contain production data and must not enter Git, release
archives, Docker build contexts, or ordinary logs.

## Isolated target

- Ephemeral local image:
  `postgres:17.10-bookworm@sha256:4f736ae292687621d4dbe0d499ffd024a36bd2ee7d8ca6f2ccd4c800f047b394`.
- Ephemeral volume and container were removed automatically after the check.
- Database owner: `relayhub_sms_owner`.
- Public schema owner: `relayhub_sms_owner`.
- Owner/migrator attributes: non-superuser, no database creation, no role
  creation, no replication, connection limit 5.
- Runtime attributes: non-superuser, no database creation, no role creation, no
  inheritance, no replication, connection limit 20, zero owned objects.

## Restore comparison

The comparison passed with zero discrepancies:

- database name, PostgreSQL major version, encoding, collation, and ctype;
- 40-table schema fingerprint
  `6672a641536aced704b5f2653333c47c08bbd714a6cfd087b49c45ea4bae41cd`;
- `pgcrypto` 1.3 and `plpgsql` 1.0;
- all 20 migration-ledger filenames;
- all protected business, credential, consent, authorization, queue, delivery,
  conversation, callback, and event counts;
- zero tested organization/program/message/authorization/key/attempt/receipt/
  conversation/event relationship orphans.

Protected counts included 2 organizations, 2 messaging programs, 1 recipient
authorization, 7 messages, 7 message attempts, 33 message events, and 12
platform events. `gateway_health` and `gateway_logs` were inventoried but
excluded from exact comparison because live heartbeat/log writes continued
during the read-only backup.

## Business-path smoke

All tests ran only against the ephemeral restored database:

- valid API credentials authenticated;
- invalid API credentials were rejected;
- one authorized API SMS path queued successfully with a non-sending smoke
  marker and was not claimed by a gateway;
- missing recipient consent was rejected;
- active STOP/opt-out suppression was enforced;
- unavailable database readiness returned the generic HTTP-503 contract.

The first smoke attempt uncovered an application defect: webhook callback
deduplication named the columns of a partial unique index without repeating its
predicate. The code now targets the partial index with the matching
`WHERE webhook_subscription_id IS NOT NULL AND platform_event_id IS NOT NULL`
predicate. The rerun passed.

## Timing and maintenance window

Measured on the current small dataset:

- isolated database start: 1 second;
- restore: less than 1 measured second;
- migration/grants and comparison: 1 second;
- smoke paths: less than 1 measured second;
- total automated drill: 2 seconds.

The production maintenance window must include human gates, write fencing,
final backup verification, secret update, container recreation, public health,
and rollback decision time. Recommended reservation: **20 minutes**, with:

- 5 minutes to fence and verify writes;
- 3 minutes for final protected backup and archive validation;
- 3 minutes for restore, grants, and comparison;
- 4 minutes for secret/container cutover and readiness;
- 3 minutes for business-path smoke;
- 2 minutes of decision buffer.

Trigger rollback if the target database comparison is not exact, runtime-role
checks fail, public readiness does not pass within the 120-second deadline, or
business-path smoke fails by minute 10.

## Rollback

The source database remains unchanged and authoritative until cutover closeout.
For a failed cutover:

1. keep writes fenced;
2. restore only Relay Hub's prior protected `DATABASE_URL`;
3. recreate only the Relay Hub application container under separate approval;
4. verify liveness, readiness, protected counts, consent/STOP behavior, and
   authentication;
5. reopen writes only after validation;
6. retain the target instance and evidence for diagnosis.

Rollback never runs reverse migrations, resets records, restores over the
source, deletes the target volume, or changes the Work Items database.

## Remaining approval blockers

- Team marketplace Sheldon Deploy 0.2.0 is not yet published; the current 0.1.0
  executable cannot deploy schema 2.
- Matthew has not selected or tested the independent Relay Hub/host fallback
  notification channel.
- Historical release/cache cleanup is not approved.
- Live PostgreSQL instance/volume creation is not approved.
- Live role/secret changes are not approved.
- Write fencing, final production backup/migration, container recreation,
  deployment, and rollback are not approved.
