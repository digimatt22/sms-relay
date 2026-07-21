# Implementation Kickoff Prompts

Status: Draft.

## Phase 0 Short Command
Use the DPAF implementation kickoff prompt for Phase 0 in `docs/dpaf/19-implementation-kickoff-prompts.md`.

## Phase 0 Full Prompt
```text
Set a goal: scaffold RelayHub SMS so implementation phases can proceed with a working local app structure and validation commands.

Use these implementation sources:
- docs/dpaf/PRD.md
- docs/dpaf/18-codex-build-plan.md
- docs/dpaf/12-frontend-architecture.md
- docs/dpaf/13-backend-architecture.md
- docs/dpaf/15-deployment.md
- docs/dpaf/adr/

Milestone:
Create the repo scaffold for a locally runnable Next.js + Postgres hub plus a placeholder TypeScript/Node gateway service workspace.

Scope:
1. Create application/package structure.
2. Add lint, typecheck, test, build, and dev scripts.
3. Add environment examples for cloud hub and gateway service.
4. Add local Postgres setup and placeholder database migration setup.
5. Add README/setup notes that point to DPAF docs.

Acceptance criteria:
- Local dev command starts the dashboard shell.
- Local Postgres setup is documented.
- `lint`, `typecheck`, `test`, and `build` commands exist.
- No product behavior beyond scaffold is implemented.

Validation:
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

Non-goals:
- Do not implement SMS sending.
- Do not implement gateway claim logic.
- Do not implement hosted Vercel deployment yet.

Do not treat this as a blank project. Follow the DPAF docs, accepted ADRs, and existing repository conventions. Keep implementation conservative and scoped to Phase 0.
```

## Phase 1 Short Command
Use the DPAF implementation kickoff prompt for Phase 1 in `docs/dpaf/19-implementation-kickoff-prompts.md`.

## Phase 1 Full Prompt
```text
Set a goal: implement the RelayHub SMS Postgres data model and migration baseline.

Use these implementation sources:
- docs/dpaf/PRD.md
- docs/dpaf/08-database-design.md
- docs/dpaf/18-codex-build-plan.md
- docs/dpaf/adr/ADR-001-cloud-hub-stack.md
- docs/dpaf/adr/ADR-002-central-api-message-claiming.md

Milestone:
Database schema exists for messages, attempts, gateways, logs, health, and Auth.js/NextAuth.js local admin users/session mapping.

Scope:
1. Add migrations/schema definitions.
2. Add indexes required for queue and claim behavior.
3. Add seed/dev fixtures.
4. Add basic tests for schema and lifecycle constraints where practical.

Acceptance criteria:
- Migrations run locally.
- Message lifecycle fields support the PRD states.
- Gateway and log/health tables support dashboard needs.
- `customerRef` is represented through message metadata, not a first-class column.

Validation:
- `npm run db:migrate`
- `npm test`
- `npm run typecheck`

Non-goals:
- Do not implement dashboard pages beyond what is needed to verify setup.
- Do not implement real SIM7070 behavior.
```

## Phase 2 Short Command
Use the DPAF implementation kickoff prompt for Phase 2 in `docs/dpaf/19-implementation-kickoff-prompts.md`.

## Phase 2 Full Prompt
```text
Set a goal: build the message insertion API and admin queue dashboard for RelayHub SMS.

Use these implementation sources:
- docs/dpaf/PRD.md
- docs/dpaf/09-api-specification.md
- docs/dpaf/12-frontend-architecture.md
- docs/dpaf/18-codex-build-plan.md

Milestone:
Admins can create messages and inspect queue/detail state through the dashboard and API.

Scope:
1. Implement message create/list/detail endpoints.
2. Implement dashboard queue, message detail, and create-message form.
3. Support flexible metadata and idempotency key storage.
4. Add tests for message creation and validation.

Acceptance criteria:
- Admin can create a message from dashboard.
- API can create a message with all PRD fields, including flexible metadata.
- Queue/detail pages show status, metadata, attempts, claim fields, and errors.

Validation:
- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

Non-goals:
- Do not implement gateway claiming yet.
- Do not implement SMS sending yet.
```

## Later Phases
Generate final prompts for Phases 3-7 after Phase 0-2 implementation confirms repository conventions and deployment choice.
