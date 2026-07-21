# Database Design

Status: Draft.

## Recommended Store
Use Postgres for MVP. It fits the central claim/lease model, auditability, dashboard filtering, and future reporting needs without introducing queue infrastructure too early.

## Core Tables

### `messages`
- `id`: UUID primary key.
- `to_number`: normalized destination number.
- `body`: SMS body.
- `priority`: integer, default 100.
- `scheduled_at`: nullable timestamp.
- `status`: enum/string: `queued`, `claimed`, `sending`, `carrier_submitted`, `retry_scheduled`, `failed`, `dead_lettered`, `canceled`.
- `idempotency_key`: nullable unique key scoped to source/account.
- `metadata`: JSONB for use-case-specific fields.
- `callback_url`: nullable text.
- `claim_gateway_id`: nullable gateway UUID.
- `claim_expires_at`: nullable timestamp.
- `attempt_count`: integer.
- `next_attempt_at`: nullable timestamp.
- `last_error`: nullable text.
- `created_by_user_id`: nullable admin user UUID.
- `created_at`, `updated_at`, `submitted_at`, `finalized_at`: timestamps.

### `message_attempts`
- `id`: UUID primary key.
- `message_id`: FK.
- `gateway_id`: FK.
- `attempt_number`: integer.
- `status`: `started`, `carrier_submitted`, `failed`.
- `modem_response`: nullable text or redacted JSON.
- `error_code`, `error_message`: nullable.
- `started_at`, `finished_at`: timestamps.

### `gateways`
- `id`: UUID primary key.
- `name`: operator label.
- `status`: `unknown`, `online`, `degraded`, `offline`, `disabled`.
- `api_key_hash`: current key hash.
- `api_key_last_used_at`: nullable timestamp.
- `last_heartbeat_at`: nullable timestamp.
- `software_version`: nullable text.
- `hardware_type`: nullable text.
- `modem_imei`: nullable text.
- `sim_iccid`: nullable text.
- `carrier`: nullable text.
- `apn_profile`: nullable text.
- `created_at`, `updated_at`, `disabled_at`: timestamps.

### `gateway_logs`
- `id`: UUID primary key.
- `gateway_id`: FK.
- `level`: `debug`, `info`, `warn`, `error`.
- `event_type`: normalized event key.
- `message`: text.
- `context`: JSONB.
- `created_at`: timestamp.
- Retention: 90 days.

### `gateway_health`
- `id`: UUID primary key.
- `gateway_id`: FK.
- `status`: summary status.
- `metrics`: JSONB for signal, modem, queue, process, and network data.
- `created_at`: timestamp.
- Retention: 90 days for raw samples unless summarized later.

### `admin_users`
- Local database-backed admin identity for Auth.js/NextAuth.js MVP credentials.
- Future-compatible role field: `admin`, `operator`, `read_only`.

## Indexes
- `messages(status, priority, scheduled_at, next_attempt_at)`.
- `messages(claim_expires_at)` for failover scans.
- `messages(idempotency_key)` unique where non-null.
- `message_attempts(message_id, attempt_number)`.
- `gateways(status, last_heartbeat_at)`.
- `gateway_logs(gateway_id, created_at desc)`.
- `gateway_health(gateway_id, created_at desc)`.

## Decisions
- Final MVP message lifecycle states: `queued`, `claimed`, `sending`, `carrier_submitted`, `retry_scheduled`, `failed`, `dead_lettered`, `canceled`.
- `customerRef` lives in flexible message `metadata` for MVP, not as a first-class column.
- Phone numbers must be redacted in logs and UI diagnostics, preserving only the last 4 digits.
- SMS body may be stored in MVP logs and admin UI.

## Open Questions
- No blocking database questions remain.
