# RelayHub SMS Production Expansion Plan

## Summary

Production should evolve from the current MVP into a multi-tenant SMS relay platform with strong gateway operations, controlled client access, durable message lifecycle tracking, and operator-grade reliability.

Approved defaults:
- Tenancy model: Organizations
- Gateway access model: Gateway pools
- First production milestone: Operational reliability

The current MVP already proves the core loop: dashboard/API message creation, central claim API, Raspberry Pi SIM7070 gateway send path, inbound polling, logs, health, client API keys, cancel/requeue, and phone normalization. Production work should keep that architecture but harden ownership, routing, observability, recovery, and management.

## Key Production Use Cases

- Platform admin: manage organizations, users, gateways, gateway pools, client keys, global health, retention, and audit logs.
- Organization admin: manage their API clients, webhook URLs, allowed gateway pools, usage, opt-outs, and message history.
- Operator: monitor queues, cancel/requeue messages, inspect gateway health, rotate keys, edit gateway names, disable devices, and run diagnostics.
- API client developer: create messages, use idempotency safely, receive delivery/inbound callbacks, inspect status, cancel/requeue owned messages, and rotate credentials.
- Gateway technician: install/update appliance software, verify modem/network health, run diagnostics, and recover hardware without database access.
- Compliance/support: audit message activity, enforce STOP/opt-out, export usage, investigate failures, and apply retention rules.

## Production Build Plan

### 1. Operational Reliability First

- Add explicit gateway states: `online`, `degraded`, `offline`, `disabled`, `maintenance`, with status computed from heartbeat recency, modem health, error rate, and queue activity.
- Add gateway diagnostics:
  - last AT sync result
  - signal quality
  - SIM state
  - carrier registration
  - modem storage usage
  - serial baud/device
  - software version
  - install/config fingerprint
- Add operator actions:
  - edit gateway name, carrier, APN, notes, location
  - rotate gateway key
  - disable/enable gateway
  - mark maintenance mode
  - request gateway diagnostics on next poll
- Add alerting rules:
  - gateway offline
  - repeated send failures
  - queue depth above threshold
  - stuck `sending` messages
  - callback delivery failures
  - modem registration/signal degradation
- Add retention jobs:
  - 90-day raw logs and health
  - longer aggregated daily usage summaries
  - configurable message body retention later

### 2. Organizations, Users, Roles

- Add `organizations` and `organization_memberships`.
- Scope API clients, gateways, messages, inbound messages, logs, and pools to `organization_id`.
- Roles:
  - `platform_admin`: all organizations and fleet controls
  - `org_admin`: organization settings, clients, pools, users
  - `operator`: message/gateway operations
  - `viewer`: read-only dashboard
- Update dashboard navigation to support organization context.
- Keep current local Auth.js login for near-term production, but design schema so Auth0/SAML/OIDC can replace it later.

### 3. Client Management And Key Rotation

- Replace single API key columns with key tables:
  - `api_client_keys`
  - `gateway_keys`
- Support multiple active keys per client/gateway during rotation.
- Store key prefix, hash, created date, last used, revoked date, and created-by user.
- Add dashboard actions:
  - rename client
  - disable/enable client
  - rotate client key
  - revoke old key
  - view usage by 1h, 24h, 7d, 30d
- API clients can only read/cancel/requeue/status-check messages they created.
- Scope idempotency keys by organization/client:
  - unique on `(organization_id, api_client_id, idempotency_key)`

### 4. Gateway Pools And Routing

- Add gateway pools:
  - `gateway_pools`
  - `gateway_pool_memberships`
  - `api_client_gateway_pool_access`
- Each message has an optional target pool; default pool is chosen from the submitting client.
- Claim API only returns messages to gateways that belong to an allowed pool for that message/client.
- Add routing policy fields:
  - priority
  - max attempts
  - allowed pools
  - preferred pool
  - excluded gateways
  - scheduled send window
- Start with failover-first routing:
  - choose any healthy eligible gateway
  - avoid recently failing gateways
  - keep best-effort duplicate prevention
- Later add load balancing:
  - weighted round-robin or least-recent-send
  - per-gateway throughput caps
  - per-client rate limits

### 5. Message Lifecycle, Inbound, And Callbacks

- Preserve current outbound states, but add a durable event log:
  - `message_events`
  - records create, claim, attempt start, submitted, failed, canceled, requeued, callback events
- Add callback delivery queue:
  - `callback_deliveries`
  - retry with backoff
  - signed webhook payloads
  - dashboard retry button
- Standardize callback payloads for:
  - outbound status
  - inbound message
  - STOP/START/YES/NO command
- Add opt-out handling:
  - `opt_outs` scoped by organization and phone number
  - inbound `STOP`, `UNSTOP`, `START` processing
  - block outbound sends to opted-out numbers unless explicitly overridden by platform admin
- Add inbound routing:
  - match replies to recent outbound messages by phone number/client
  - route to source client callback URL
  - allow organization-level fallback callback URL

## Public Interfaces And Data Model Changes

- New dashboard areas:
  - Organizations
  - Users/Roles
  - Gateway Pools
  - Client detail
  - Gateway edit/detail/diagnostics
  - Callback deliveries
  - Opt-outs
  - Usage reports
  - Alerts
- New/expanded API endpoints:
  - `GET /api/messages/:id`
  - `POST /api/messages/:id/cancel`
  - `POST /api/messages/:id/requeue`
  - `GET /api/messages/:id/events`
  - `POST /api/clients/:id/keys/rotate`
  - `POST /api/clients/:id/disable`
  - `POST /api/gateways/:id/keys/rotate`
  - `PATCH /api/gateways/:id`
  - `POST /api/gateways/:id/disable`
  - `POST /api/gateway-pools`
  - `PATCH /api/gateway-pools/:id`
  - `POST /api/webhooks/test`
- New core tables:
  - `organizations`
  - `organization_memberships`
  - `api_client_keys`
  - `gateway_keys`
  - `gateway_pools`
  - `gateway_pool_memberships`
  - `api_client_gateway_pool_access`
  - `message_events`
  - `callback_deliveries`
  - `opt_outs`
  - `daily_usage_rollups`
  - `alerts`
  - `gateway_commands`

## Test And Acceptance Plan

- Unit tests:
  - phone normalization and rejection
  - idempotency scoped by client
  - client-owned cancel/requeue/status access
  - gateway pool eligibility
  - key rotation accepts new key and rejects revoked key
  - STOP/START opt-out rules
- Integration tests:
  - API client creates message into allowed pool
  - gateway from allowed pool claims message
  - gateway outside allowed pool receives no work
  - stuck claimed/sending message is recovered safely
  - callback retry succeeds after transient failure
- Hardware tests:
  - cold boot sends first message without manual intervention
  - repeated messages send without post-success power reset
  - modem rejection does not trigger PWRKEY recovery
  - inbound reply uploads and deletes without duplicate callback delivery
- Dashboard acceptance:
  - admin can edit gateway names
  - admin can rotate client and gateway keys
  - admin can assign clients to gateway pools
  - operator can cancel/requeue eligible messages
  - operator can see gateway health, logs, attempts, and diagnostics
- Production readiness:
  - migration test from MVP schema
  - backup/restore runbook
  - install/update runbook for Pi appliances
  - monitoring dashboard and alert thresholds
  - 90-day retention job verified

## Implementation Status

Implemented in the current workspace:
- Organization foundation with default DigiColony organization and admin membership backfill.
- Organization-scoped API clients, gateways, messages, inbound messages, gateway logs, gateway health, and gateway pools.
- Organization dashboard switcher, organization creation page, and active-organization scoping for primary dashboard list/detail pages.
- Per-organization default gateway pools for new organizations, clients, gateways, and dashboard-submitted messages.
- Separate `api_client_keys` and `gateway_keys` tables with active-key authentication, key rotation, and revocation on disable.
- Gateway pools, gateway membership, client pool access, default pool routing, and pool-aware message claiming.
- Scoped idempotency by organization plus API client; dashboard-submitted messages are scoped separately from client API messages.
- Message event logging for create, claim, attempt start, submitted, failure/retry, cancel, requeue, inbound receipt, and opt-out capture.
- Inbound reply matching by organization, recent outbound recipient, submitted timestamp, and 7-day window.
- STOP-style opt-out capture and outbound blocking for active opt-outs, with explicit metadata override support reserved for admin workflows.
- Callback delivery records, retry processor, retry API, and dashboard page.
- Operational alert generation for offline gateways, repeated send failures, high queue depth, stuck sending messages, and repeated callback failures.
- 90-day raw gateway log/health retention job and daily usage rollup refresh.
- Role normalization and role gates for sensitive API operations, preserving legacy `admin` users as `platform_admin`.
- Local dashboard user creation, organization membership assignment/removal, and membership role editing.
- Enable/re-enable flows for disabled clients and gateways.
- Gateway command queue with appliance polling/execution for diagnostics, modem reset, and service restart.
- Client hourly/daily message limits, gateway hourly send caps, and gateway routing weight fields.
- Routing avoids gateways with repeated recent send failures and respects per-gateway hourly caps.
- Routing rejects disabled, maintenance, offline, stale-heartbeat, and unusable-signal gateways before claim assignment.
- Dashboard pages for routing, callbacks, alerts, and usage.
- Page-level role gates and read-only viewer behavior across sensitive dashboard mutation surfaces.
- Time-limited dashboard user invitation flow with recipient password setup.
- Focused regression tests for scoped idempotency, opt-outs, pool-aware claims, key-table auth, callback retries, and telemetry retention.
- Customer-facing webhook integration guide.
- Backup, restore, deployment, and appliance update runbook.
- Automated production deploy check script for typecheck, tests, hub build, gateway build, and gateway package.

Remaining production-hardening work:
- SMTP delivery for invitation links instead of dashboard copy/paste.
- Hosted CI/CD wiring for `npm run deploy:check` and environment-specific migration approval.

## Assumptions

- Production remains Next.js + Postgres initially.
- Vercel plus managed Postgres remains acceptable for the hub unless operational needs push us to AWS.
- Raspberry Pi Zero 2 W + SIM7070G remains the first production appliance target.
- Gateway pools are the default routing boundary.
- Organizations are the production tenant boundary.
- Operational reliability work comes before deeper billing, self-service onboarding, or high-scale load balancing.
- SMS body remains visible to admins for now, but retention and redaction controls should be added before broader customer rollout.
