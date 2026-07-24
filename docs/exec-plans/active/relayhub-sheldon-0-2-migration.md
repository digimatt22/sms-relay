# Relay Hub Sheldon 0.2.0 Migration

Status: in progress
Started: 2026-07-24
Branch: `codex/relayhub-sheldon-0-2-migration`
Platform plan: `/Users/mwood/Documents/Digicolony/Codex/social-content/docs/exec-plans/active/sheldon-platform-hardening-and-deployment-migration.md`

## Goal

Move Relay Hub to the enhanced Sheldon schema-2 deployment contract and an
application-owned PostgreSQL instance without losing client, consent,
credential, queue, delivery, or message-history semantics.

## Authority and provenance

- Use the team marketplace package at
  `/Users/mwood/Documents/Digicolony/digicolony-codex-marketplace/plugins/sheldon-deploy`.
- Do not use or modify the installed plugin cache as source.
- The marketplace currently publishes Sheldon Deploy `0.1.1`. Its exact-source
  package-audit engine is part of Relay Hub's candidate workflow, but its
  executable manifest/deployment contract remains schema 1. The target
  schema-2 sections and operational requirements come from the platform plan.
- Do not claim tool-level 0.2.0 compatibility until the marketplace publishes
  that version and its clean-install smoke evidence passes.
- Every candidate archive must be derived from one exact, clean Git commit and
  must pass the local contract and package-audit checks.

## Baseline evidence

- Baseline commit: `deccd1133acc77d2ab10f0a9ef79b12b4d928723`.
- Baseline verification: TypeScript, gateway build, Next.js production build,
  and 88 tests passed.
- Live status at orientation:
  - release `20260724T181648Z`;
  - container `sheldon-relayhub-sms-app-1`;
  - origin HTTP `200`;
  - non-root `nextjs` process;
  - application subnet `10.246.135.0/24`.
- Live PostgreSQL read-only snapshot:
  - database `relayhub_sms`;
  - role `relayhub_sms_runtime`;
  - PostgreSQL `17.10`, version number `170010`;
  - 20 migration-ledger rows through
    `019_delivery_receipts_conversations_webhooks.sql`;
  - 2 organizations, 2 messaging programs, 1 recipient authorization,
    6 messages, 7 message attempts, and 11 platform events;
  - zero orphan messages, authorizations, API keys, or attempts in the tested
    relationships.
- Seven historical release-source copies of
  `backups/relayhub-pre-019.dump` exist with mode `0644`, including the current
  release source. They are cleanup targets, not authorized deletions.

## Invariants

- Preserve PostgreSQL major version 17. A major-version change requires a
  separate reviewed database-upgrade plan.
- Preserve database name `relayhub_sms`.
- Preserve the complete migration ledger and schema.
- Preserve protected record counts and relationships for organizations,
  messaging programs, disclosure/template versions, recipient authorization
  and events, suppressions/opt-outs, API clients and keys, messages, attempts,
  receipts, conversations, callbacks, and platform events.
- Preserve client-scoped program ownership and credential scope.
- Preserve verified-consent enforcement and STOP suppression at create, claim,
  and attempt boundaries.
- Keep `relayhub_sms_runtime` least-privilege and non-owning.
- Use a separate `relayhub_sms_owner`/migrator role for schema changes.
- Never place passwords, URLs containing credentials, message bodies, raw phone
  numbers, or customer data in plans, manifests, logs, evidence, or alerts.
- Application rollback never implies database downgrade, reset, or restore.

## Required implementation phases

### Phase A — Exact-source and exclusion controls

- Deny `backup/`, `backups/`, `*.dump`, local database files, secrets, private
  keys, credential exports, archives, and untracked sensitive artifacts from
  both release archives and Docker contexts.
- Add a clean-worktree, exact-commit release packager and package audit.
- Run the exact-source safety engine from the team marketplace, never an
  installed cache, and record its marketplace version and commit.
- Prove ignored-but-present prohibited fixtures cannot enter an archive.
- Prepare a target-specific historical release/cache cleanup runbook. Do not
  execute it.

### Phase B — Schema-2 and application-owned database contract

- Adopt explicit release, service, ingress, network, secret, storage, database,
  rollout, and observability sections.
- Declare a PostgreSQL 17 service and persistent named volume.
- Declare resource limits, restart/shutdown policy, connection limit,
  statement/lock/idle timeouts, liveness, readiness, backup, and restore-check
  hooks.
- Keep migrations as a separately authorized one-shot operation.
- Validate that runtime configuration uses only `relayhub_sms_runtime` and that
  migrations use only the owner/migrator role.

### Phase C — Dry-run migration and monitoring

- Create a logical source backup in a protected location.
- Restore to an isolated PostgreSQL 17 instance.
- Compare server compatibility, schema, migration ledger, protected counts,
  and relationships.
- Exercise an authorized SMS path with a non-sending test adapter.
- Exercise missing consent, STOP suppression, invalid credentials, and
  unavailable-database failures.
- Measure backup, restore, comparison, and smoke-test durations to produce a
  maintenance-window estimate.
- Document rollback to the original database endpoint without database
  downgrade or data deletion.
- Provide a default-off write fence that rejects mutations while preserving
  health/readiness checks, and test it before relying on it in the cutover.
- Provide an external host watchdog contract for route, process, database,
  disk, memory, build-cache, and backup-age checks.
- Leave the independent fallback notification channel as an explicit human
  decision; Relay Hub SMS cannot be its own sole outage channel.

### Phase D — Review package

- Record exact commits, checksums, backup reference, restore evidence,
  comparison evidence, alert fallback status, maintenance-window estimate, and
  rollback procedure.
- Stop for review before the first live mutation.

## Approval gates

Stop immediately before each of these operations and obtain explicit approval:

1. deleting historical release-source or build-cache artifacts;
2. creating or changing the live PostgreSQL instance or volume;
3. creating/changing live database roles or server secrets;
4. stopping or fencing production writes;
5. backing up for or migrating production data;
6. recreating live application or database containers;
7. deploying, cutting over, rolling back, or restoring production.

Read-only inventory, local implementation, tests, local isolated databases, and
dry-run validation against non-production copies may continue automatically.

## Progress log

- 2026-07-24: Created migration branch and pushed verified baseline commit.
- 2026-07-24: Captured read-only Sheldon status, PostgreSQL version/ledger/count
  evidence, relationship checks, and historical dump-copy inventory.
- 2026-07-24: Completed and pushed Phase A exact-source packaging, exclusion
  tests, and gated cleanup instructions.
- 2026-07-24: Adopted the self-validating schema-2 manifest, dedicated
  PostgreSQL 17 service/volume contract, bounded connections/timeouts, separate
  owner/runtime roles, and separately authorized migrations. Full build and 97
  tests passed.
- 2026-07-24: Completed the protected backup and isolated PostgreSQL 17.10
  restore drill. Schema, ledger, protected counts, relationships, roles, and
  SMS success/failure paths passed. The drill found and fixed the webhook
  partial-index conflict target. Recommended production window: 20 minutes.
- 2026-07-24: Added host-level watchdog/systemd contracts. Installation remains
  blocked until Matthew selects and tests an independent fallback channel.
- 2026-07-24: Integrated the team-marketplace 0.1.1 exact-source safety engine
  into detached-worktree candidate packaging. Added a testable default-off
  application write fence and the granular production cutover/rollback
  runbook. Schema-2 deployment remains blocked on marketplace 0.2.0.
