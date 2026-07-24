#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${RELAYHUB_DB_OWNER_PASSWORD:?RELAYHUB_DB_OWNER_PASSWORD is required}"
: "${RELAYHUB_DB_RUNTIME_PASSWORD:?RELAYHUB_DB_RUNTIME_PASSWORD is required}"

if [[ "$POSTGRES_USER" != "relayhub_sms_cluster_admin" ]]; then
  printf 'POSTGRES_USER must be relayhub_sms_cluster_admin\n' >&2
  exit 1
fi
if [[ "$POSTGRES_DB" != "relayhub_sms" ]]; then
  printf 'POSTGRES_DB must be relayhub_sms\n' >&2
  exit 1
fi

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv owner_password RELAYHUB_DB_OWNER_PASSWORD
\getenv runtime_password RELAYHUB_DB_RUNTIME_PASSWORD
SELECT format(
  'CREATE ROLE relayhub_sms_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION CONNECTION LIMIT 5 PASSWORD %L',
  :'owner_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'relayhub_sms_owner'
)
\gexec
SELECT format(
  'CREATE ROLE relayhub_sms_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 20 PASSWORD %L',
  :'runtime_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'relayhub_sms_runtime'
)
\gexec
ALTER ROLE relayhub_sms_owner CONNECTION LIMIT 5;
ALTER ROLE relayhub_sms_owner SET statement_timeout = '5min';
ALTER ROLE relayhub_sms_owner SET lock_timeout = '10s';
ALTER ROLE relayhub_sms_owner SET idle_in_transaction_session_timeout = '5min';
ALTER ROLE relayhub_sms_runtime CONNECTION LIMIT 20;
ALTER ROLE relayhub_sms_runtime SET statement_timeout = '30s';
ALTER ROLE relayhub_sms_runtime SET lock_timeout = '5s';
ALTER ROLE relayhub_sms_runtime SET idle_in_transaction_session_timeout = '30s';
REVOKE ALL ON DATABASE relayhub_sms FROM PUBLIC;
ALTER DATABASE relayhub_sms OWNER TO relayhub_sms_owner;
ALTER SCHEMA public OWNER TO relayhub_sms_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE relayhub_sms TO relayhub_sms_runtime;
GRANT USAGE ON SCHEMA public TO relayhub_sms_runtime;
SQL
