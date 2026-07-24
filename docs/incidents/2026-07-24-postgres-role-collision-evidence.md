# PostgreSQL Role Collision Validation Evidence

Incident: 2026-07-24 Sheldon PostgreSQL role collision.

Secret values are intentionally omitted. Times are UTC.

## Pre-Change Snapshot

Captured: 2026-07-24 12:58-13:00 UTC.

### Application And Environment Inventory

- RelayHub container: `sheldon-relayhub-sms-app-1`, loopback port `35607`.
- Portal container: `sheldon-digicolony-client-ops-app-1`, loopback port
  `39732`.
- Portal environment: user `appuser`, host `172.18.0.2`, port `5432`,
  database `appdb`, file mode `0600`.
- RelayHub environment: user `appuser`, host `172.18.0.2`, port `5432`,
  database `relayhub_sms`, file mode `0600`.
- Sheldon environment references to `relayhub_sms_runtime`: `0`.
- Database owners: `appdb` = `appuser`; `relayhub_sms` = `appuser`.
- `appuser` was a login superuser with database/role creation privileges.
- `relayhub_sms_runtime` did not exist.
- All 33 portal public tables and all 40 RelayHub public tables were owned by
  `appuser`.
- Neither database had default privilege entries.

### Public Behavior And Logs

- RelayHub `GET /api/health`: HTTP 503,
  `{"status":"unavailable"}`.
- RelayHub `GET /api/ready`: HTTP 404 because the route was not deployed.
- Portal `GET /api/health`: HTTP 200, `{"status":"ok"}`.
- Portal controlled invalid-credentials sign-in:
  `/sign-in?error=credentials` with the visible alert
  `Email or password is incorrect.`
- RelayHub matching authentication-failure log lines in the prior two hours:
  `1328`; sampled failures were PostgreSQL `28P01` for `appuser`.

### Exact Portal Counts (`appdb`)

```text
Account|0
ActivityEvent|21
AgentClaim|0
AgentDispatch|0
AiAction|0
Asset|2
AssetLink|2
Client|3
Comment|0
DeliverableShare|2
DeliveryAttempt|0
DeliveryEvidence|0
Label|0
McpAccessGrant|0
McpAuthorizationCode|0
McpOAuthClient|0
Mention|0
OutboxEvent|0
PasswordCredential|3
PipelineStatus|4
Project|6
ProjectBinding|0
ProjectMember|0
ReleaseTarget|0
Session|0
User|3
VerificationToken|0
Watcher|0
WorkItem|1
WorkItemBugDetails|0
WorkItemFeatureDetails|1
WorkItemLabel|0
WorkQualification|0
```

### Exact RelayHub Counts (`relayhub_sms`)

```text
admin_users|4
alerts|0
api_client_gateway_pool_access|0
api_client_keys|0
api_clients|0
callback_deliveries|0
consent_disclosure_versions|1
conversation_threads|0
daily_usage_rollups|3
delivery_receipts|0
gateway_access|1
gateway_commands|1
gateway_health|1274
gateway_keys|1
gateway_logs|10473
gateway_pool_memberships|1
gateway_pools|1
gateways|1
inbound_messages|3
message_attempts|4
message_events|19
messages|4
messaging_programs|1
mobile_verification_codes|2
opt_outs|0
organization_memberships|2
organization_plans|1
organizations|1
password_reset_codes|0
plans|3
platform_events|0
platform_suppressions|0
pricing_leads|0
recipient_authorization_events|0
recipient_authorizations|0
schema_migrations|20
user_invitations|3
verification_challenges|0
verification_template_versions|1
webhook_subscriptions|0
```

## Live Operations

### Operation 1: Runtime Role Creation

Completed at 2026-07-24 13:20 UTC after Matthew's explicit confirmation.

- Created `relayhub_sms_runtime` with login enabled and superuser, database
  creation, role creation, inheritance, and replication privileges disabled.
- Transferred RelayHub's pre-existing distinct password entirely on Sheldon
  without displaying or copying it locally.
- Granted `CONNECT` on `relayhub_sms`, `USAGE` on `public`, required DML on all
  40 existing tables, and required privileges on existing sequences.
- Added two matching default privilege entries for objects created by the
  confirmed current owner, `appuser`.
- Verified the new role authenticated and completed `SELECT 1` in
  `relayhub_sms`.
- Verified the new role could not read the portal's `public."User"` table.
- Changed no environment files, containers, `appuser` attributes/password, or
  application records.

### Operation 2: RelayHub Secret Update

Completed at 2026-07-24 13:46 UTC after Matthew's explicit confirmation.

- Atomically updated only RelayHub's protected `DATABASE_URL` username to
  `relayhub_sms_runtime`.
- Preserved RelayHub's existing distinct password and the URL scheme, host,
  port, database name, query string, and encoding without displaying the
  credential.
- Preserved mode `0600` and created a mode-`0600` server-side rollback copy.
- Confirmed RelayHub is the only Sheldon environment referencing
  `relayhub_sms_runtime`.
- Confirmed the running RelayHub container was not recreated and still has its
  prior `appuser` environment. The container remains unchanged until Gate 3.
- Changed no portal environment, `appuser` attribute/password, canonical
  PostgreSQL password file, container, or application record.

### Operation 3: RelayHub Deployment

Completed at 2026-07-24 13:58 UTC after Matthew's explicit confirmation.

- Deployed Sheldon release `20260724T135803Z`.
- Recreated only `sheldon-relayhub-sms-app-1`.
- Activated container `c0a05558b3c3`, started at
  `2026-07-24T13:58:38.348701621Z`.
- The deployment health gate used `/api/ready` and passed.
- Applied no migration, reset, seed, restore, truncation, or record deletion.
- Did not recreate PostgreSQL or the portal container.

## Post-Change Snapshot

Captured at 2026-07-24 13:59-14:02 UTC.

- RelayHub public `GET /api/health`: HTTP 200, `{"status":"ok"}`.
- RelayHub public `GET /api/ready`: HTTP 200, `{"status":"ready"}`.
- The running RelayHub container uses `relayhub_sms_runtime`.
- A controlled read-only query through the running RelayHub container confirmed
  database `relayhub_sms`, role `relayhub_sms_runtime`, and
  `schema_migrations = 20`.
- RelayHub PostgreSQL authentication-failure log matches since deployment: `0`.
- All 40 RelayHub table counts exactly matched the pre-change snapshot.
- Portal public `GET /api/health`: HTTP 200, `{"status":"ok"}`.
- All 33 portal table counts exactly matched the pre-change snapshot.
- Portal controlled invalid-credentials sign-in reached
  `/sign-in?error=credentials` and displayed
  `Email or password is incorrect.`.
- Sheldon application environments referencing `relayhub_sms_runtime`: `1`,
  RelayHub only.
- No database or application records were reset, seeded, restored, truncated, or
  deleted during recovery.
