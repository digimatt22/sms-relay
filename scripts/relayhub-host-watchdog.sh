#!/usr/bin/env bash
set -euo pipefail

public_url="${RELAYHUB_WATCHDOG_PUBLIC_URL:-https://sns.digicolony.net}"
container_name="${RELAYHUB_WATCHDOG_CONTAINER:-sheldon-relayhub-sms-app-1}"
postgres_container="${RELAYHUB_WATCHDOG_POSTGRES_CONTAINER:-sheldon-relayhub-sms-postgres-1}"
postgres_volume="${RELAYHUB_WATCHDOG_POSTGRES_VOLUME:-sheldon-relayhub-sms_relayhub_sms_postgres_data}"
docker_context="${RELAYHUB_WATCHDOG_DOCKER_CONTEXT:-rootless}"
backup_stamp="${RELAYHUB_BACKUP_STAMP_PATH:-}"
max_backup_age_seconds="${RELAYHUB_MAX_BACKUP_AGE_SECONDS:-129600}"
max_disk_percent="${RELAYHUB_MAX_DISK_PERCENT:-85}"
max_memory_percent="${RELAYHUB_MAX_MEMORY_PERCENT:-90}"
min_certificate_seconds="${RELAYHUB_MIN_CERTIFICATE_SECONDS:-1209600}"
current_release_link="${RELAYHUB_WATCHDOG_CURRENT_RELEASE_LINK:-/home/mwood/sheldon/apps/relayhub-sms/current}"
expected_release="${RELAYHUB_WATCHDOG_EXPECTED_RELEASE:-}"

failures=()
docker_command=(docker)
if [[ -n "$docker_context" ]]; then
  docker_command+=(--context "$docker_context")
fi

check_http() {
  local label="$1"
  local path="$2"
  local expected_body="$3"
  local body
  if ! body="$(curl --fail --silent --show-error \
    --connect-timeout 5 --max-time 10 "${public_url}${path}" 2>/dev/null)"; then
    failures+=("${label}:request_failed")
    return 1
  fi
  if [[ "$body" != "$expected_body" ]]; then
    failures+=("${label}:unexpected_body")
    return 1
  fi
  return 0
}

if check_http "liveness" "/api/health" '{"status":"ok"}'; then
  liveness_ok=true
else
  liveness_ok=false
fi
if check_http "readiness" "/api/ready" '{"status":"ready"}'; then
  readiness_ok=true
else
  readiness_ok=false
fi

container_state="$("${docker_command[@]}" inspect \
  --format '{{.State.Status}}|{{.State.Running}}|{{.State.Restarting}}' \
  "$container_name" 2>/dev/null || true)"
if [[ "$container_state" != "running|true|false" ]]; then
  failures+=("container:not_running")
fi

postgres_state="$("${docker_command[@]}" inspect \
  --format '{{.State.Status}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' \
  "$postgres_container" 2>/dev/null || true)"
if [[ "$postgres_state" != "running|true|healthy" ]]; then
  failures+=("postgres:not_ready")
fi

if "${docker_command[@]}" volume inspect "$postgres_volume" >/dev/null 2>&1; then
  postgres_volume_present=true
else
  postgres_volume_present=false
  failures+=("postgres_volume:missing")
fi

disk_percent="$(df -P /home/mwood/sheldon | awk 'NR == 2 { gsub(/%/, "", $5); print $5 }')"
if [[ -z "$disk_percent" || "$disk_percent" -ge "$max_disk_percent" ]]; then
  failures+=("disk:threshold")
fi

memory_percent="$(awk '
  /MemTotal:/ { total=$2 }
  /MemAvailable:/ { available=$2 }
  END {
    if (total > 0) printf "%.0f", ((total - available) * 100 / total)
  }
' /proc/meminfo)"
if [[ -z "$memory_percent" || "$memory_percent" -ge "$max_memory_percent" ]]; then
  failures+=("memory:threshold")
fi

backup_age_seconds=""
if [[ -z "$backup_stamp" || ! -f "$backup_stamp" ]]; then
  failures+=("backup:missing_stamp")
else
  now_epoch="$(date +%s)"
  backup_epoch="$(stat -c %Y "$backup_stamp")"
  backup_age_seconds="$((now_epoch - backup_epoch))"
  if [[ "$backup_age_seconds" -gt "$max_backup_age_seconds" ]]; then
    failures+=("backup:stale")
  fi
fi

certificate_host="$(node -e '
  try {
    process.stdout.write(new URL(process.argv[1]).hostname);
  } catch {
    process.exitCode = 1;
  }
' "$public_url" 2>/dev/null || true)"
certificate_pem=""
if [[ -n "$certificate_host" ]]; then
  certificate_pem="$(timeout 10 openssl s_client \
    -connect "${certificate_host}:443" \
    -servername "$certificate_host" </dev/null 2>/dev/null \
    | openssl x509 -outform PEM 2>/dev/null || true)"
fi
if [[ -n "$certificate_pem" ]] && printf '%s\n' "$certificate_pem" \
  | openssl x509 -checkend "$min_certificate_seconds" -noout >/dev/null 2>&1; then
  certificate_ok=true
else
  certificate_ok=false
  failures+=("certificate:expiring_or_unavailable")
fi

current_release="$(readlink -f "$current_release_link" 2>/dev/null || true)"
if [[ -z "$current_release" ]]; then
  release_ok=false
  failures+=("release:missing_current")
elif [[ -n "$expected_release" && "$current_release" != "$expected_release" ]]; then
  release_ok=false
  failures+=("release:drift")
else
  release_ok=true
fi

if build_cache_inventory="$("${docker_command[@]}" system df --format json 2>/dev/null)"; then
  build_cache_digest="$(printf '%s' "$build_cache_inventory" \
    | sha256sum | awk '{print $1}')"
else
  build_cache_digest=""
  failures+=("build_cache:unavailable")
fi

node -e '
  const [
    failures, liveness, readiness, container, postgres, volume, disk, memory,
    backupAge, certificate, releaseOk, release, cacheSnapshot,
  ] = process.argv.slice(1);
  const result = {
    checked_at: new Date().toISOString(),
    status: failures ? "failed" : "passed",
    failures: failures ? failures.split(",") : [],
    checks: {
      public_liveness: liveness === "true",
      public_readiness: readiness === "true",
      container_state: container,
      postgres_state: postgres,
      postgres_volume_present: volume === "true",
      disk_used_percent: Number(disk),
      memory_used_percent: Number(memory),
      backup_age_seconds: backupAge === "" ? null : Number(backupAge),
      certificate_valid_beyond_threshold: certificate === "true",
      release_matches_expected: releaseOk === "true",
      current_release: release || null,
      build_cache_inventory_sha256: cacheSnapshot || null,
    },
  };
  process.stdout.write(JSON.stringify(result) + "\n");
' "$(IFS=,; printf '%s' "${failures[*]:-}")" \
  "$liveness_ok" "$readiness_ok" "$container_state" "$postgres_state" \
  "$postgres_volume_present" "$disk_percent" "$memory_percent" \
  "$backup_age_seconds" "$certificate_ok" "$release_ok" "$current_release" \
  "$build_cache_digest"

if (( ${#failures[@]} > 0 )); then
  exit 1
fi
