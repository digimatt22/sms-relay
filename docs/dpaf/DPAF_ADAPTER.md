# DPAF Project Adapter

## DPAF Runtime

- Distribution: installed Codex plugin
- Plugin: `digi-cto`
- Plugin version used: `0.3.0`
- Adapter contract: `1`
- Invocation: `Work with me as the CTO partner for this project.`
- Local source override: `None`

## Project Context

- Project name: DigiColony SNS (internal repository name: SMS Gateway)
- Primary outcome: Operate a multi-tenant, auditable SMS relay platform with centrally managed gateway appliances.
- Source artifacts to read first: application source, migrations, `docs/dpaf/PRD.md`, `docs/dpaf/20-production-expansion-plan.md`, and current operator runbooks.
- Generated DPAF docs path: `docs/dpaf/`
- Implementation source path: repository root
- Production database: `relayhub_sms` on Sheldon's shared PostgreSQL server.
- Production runtime role: dedicated `relayhub_sms_runtime`; RelayHub must not
  use or alter the portal's cluster-global `appuser` role.
- Operational probes: `/api/health` for database-independent liveness and
  `/api/ready` for database-aware readiness.

## Boundaries

- Keep reusable DPAF methodology in the installed plugin.
- Keep project facts and decisions in this repository.
- Preserve unknown legal, carrier, retention, and production contracts as explicit review items.
- Do not replace counsel review with product or engineering assumptions.

## Validation

Before implementation handoff:

- run project tests, type checking, and production build;
- review security, permissions, data lifecycle, migration, rollback, and audit requirements;
- assign human validation with an owner and expected evidence;
- update canonical PRD and architecture documents only after material decisions are approved.
