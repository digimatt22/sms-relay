#!/usr/bin/env bash
set -euo pipefail

backup_path="${1:-}"
source_snapshot="${2:-}"
evidence_dir="${3:-}"
if [[ -z "$backup_path" || -z "$source_snapshot" || -z "$evidence_dir" ]]; then
  printf 'usage: scripts/database-restore-check.sh BACKUP SOURCE_SNAPSHOT EVIDENCE_DIR\n' >&2
  exit 1
fi
if [[ ! -f "$backup_path" || ! -f "$source_snapshot" ]]; then
  printf 'backup and source snapshot must exist\n' >&2
  exit 1
fi

umask 077
mkdir -p "$evidence_dir"
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/relayhub-restore-check.XXXXXX")"
container_name="relayhub-restore-check-$$"
volume_name="relayhub_restore_check_$$"
env_file="$temp_dir/postgres.env"
target_snapshot="$evidence_dir/target-snapshot.json"
comparison_report="$evidence_dir/comparison.json"
smoke_report="$evidence_dir/smoke.json"
timing_report="$evidence_dir/timing.json"
started_at="$(date +%s)"

cleanup() {
  status=$?
  if [[ "$status" -ne 0 ]]; then
    printf 'restore check failed; isolated PostgreSQL log follows\n' >&2
    docker logs --tail 80 "$container_name" 2>&1 \
      | sed -E 's/(password|secret|credential|token)=[^ ]+/\1=[REDACTED]/gi' >&2 \
      || true
  fi
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  docker volume rm "$volume_name" >/dev/null 2>&1 || true
  rm -rf "$temp_dir"
  return "$status"
}
trap cleanup EXIT

{
  printf 'POSTGRES_USER=relayhub_sms_cluster_admin\n'
  printf 'POSTGRES_DB=relayhub_sms\n'
  printf 'POSTGRES_PASSWORD='
  openssl rand -hex 24
  printf 'RELAYHUB_DB_OWNER_PASSWORD='
  openssl rand -hex 24
  printf 'RELAYHUB_DB_RUNTIME_PASSWORD='
  openssl rand -hex 24
} >"$env_file"
chmod 600 "$env_file"

docker volume create "$volume_name" >/dev/null
docker run --detach \
  --name "$container_name" \
  --env-file "$env_file" \
  --publish 127.0.0.1::5432 \
  --volume "$volume_name:/var/lib/postgresql/data" \
  --volume "$backup_path:/restore/source.dump:ro" \
  --volume "$PWD/scripts/postgres-init.sh:/docker-entrypoint-initdb.d/010-relayhub-runtime.sh:ro" \
  postgres:17.10-bookworm >/dev/null

printf 'Waiting for isolated PostgreSQL readiness...\n'
for _ in {1..60}; do
  if docker exec "$container_name" \
    pg_isready -U relayhub_sms_owner -d relayhub_sms >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$container_name" \
  pg_isready -U relayhub_sms_owner -d relayhub_sms >/dev/null
ready_at="$(date +%s)"

printf 'Restoring protected source backup...\n'
docker exec "$container_name" sh -c \
  'PGPASSWORD="$RELAYHUB_DB_OWNER_PASSWORD" pg_restore --no-owner --no-acl --exit-on-error --username relayhub_sms_owner --dbname relayhub_sms /restore/source.dump'
restored_at="$(date +%s)"

host_port="$(docker port "$container_name" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')"
owner_password="$(sed -n 's/^RELAYHUB_DB_OWNER_PASSWORD=//p' "$env_file")"
runtime_password="$(sed -n 's/^RELAYHUB_DB_RUNTIME_PASSWORD=//p' "$env_file")"
owner_url="postgres://relayhub_sms_owner:${owner_password}@127.0.0.1:${host_port}/relayhub_sms"
runtime_url="postgres://relayhub_sms_runtime:${runtime_password}@127.0.0.1:${host_port}/relayhub_sms"

printf 'Applying separately scoped migration/grant command...\n'
MIGRATION_DATABASE_URL="$owner_url" npm run db:migrate:production >/dev/null
printf 'Comparing schema, ledger, counts, relationships, and roles...\n'
DATABASE_EVIDENCE_URL="$owner_url" node scripts/database-snapshot.mjs "$target_snapshot"
node scripts/database-compare.mjs \
  "$source_snapshot" "$target_snapshot" "$comparison_report" >/dev/null
compared_at="$(date +%s)"

printf 'Exercising authorized and expected-failure SMS paths...\n'
DATABASE_URL="$runtime_url" \
MIGRATION_DATABASE_URL="$owner_url" \
  npx tsx scripts/database-smoke.ts >"$smoke_report"
smoked_at="$(date +%s)"

node -e '
  const [started, ready, restored, compared, smoked, output] = process.argv.slice(1);
  const report = {
    status: "passed",
    seconds: {
      database_start: Number(ready) - Number(started),
      restore: Number(restored) - Number(ready),
      migration_and_comparison: Number(compared) - Number(restored),
      smoke: Number(smoked) - Number(compared),
      total: Number(smoked) - Number(started),
    },
  };
  require("node:fs").writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
' "$started_at" "$ready_at" "$restored_at" "$compared_at" "$smoked_at" "$timing_report"

printf 'Isolated PostgreSQL 17 restore check passed. Evidence: %s\n' "$evidence_dir"
