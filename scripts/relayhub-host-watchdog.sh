#!/usr/bin/env bash
set -euo pipefail

public_url="${RELAYHUB_WATCHDOG_PUBLIC_URL:-https://sns.digicolony.net}"
container_name="${RELAYHUB_WATCHDOG_CONTAINER:-sheldon-relayhub-sms-app-1}"
backup_stamp="${RELAYHUB_BACKUP_STAMP_PATH:-}"
max_backup_age_seconds="${RELAYHUB_MAX_BACKUP_AGE_SECONDS:-129600}"
max_disk_percent="${RELAYHUB_MAX_DISK_PERCENT:-85}"
max_memory_percent="${RELAYHUB_MAX_MEMORY_PERCENT:-90}"

failures=()

check_http() {
  local label="$1"
  local path="$2"
  local expected_body="$3"
  local body
  if ! body="$(curl --fail --silent --show-error \
    --connect-timeout 5 --max-time 10 "${public_url}${path}" 2>/dev/null)"; then
    failures+=("${label}:request_failed")
    return
  fi
  if [[ "$body" != "$expected_body" ]]; then
    failures+=("${label}:unexpected_body")
  fi
}

check_http "liveness" "/api/health" '{"status":"ok"}'
check_http "readiness" "/api/ready" '{"status":"ready"}'

container_state="$(docker inspect \
  --format '{{.State.Status}}|{{.State.Running}}|{{.State.Restarting}}' \
  "$container_name" 2>/dev/null || true)"
if [[ "$container_state" != "running|true|false" ]]; then
  failures+=("container:not_running")
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

build_cache_bytes="$(docker system df --format json 2>/dev/null \
  | sha256sum | awk '{print $1}' || true)"

node -e '
  const [failures, container, disk, memory, backupAge, cacheSnapshot] = process.argv.slice(1);
  const result = {
    checked_at: new Date().toISOString(),
    status: failures ? "failed" : "passed",
    failures: failures ? failures.split(",") : [],
    checks: {
      public_liveness: true,
      public_readiness: true,
      container_state: container,
      disk_used_percent: Number(disk),
      memory_used_percent: Number(memory),
      backup_age_seconds: backupAge === "" ? null : Number(backupAge),
      build_cache_inventory_sha256: cacheSnapshot || null,
    },
  };
  process.stdout.write(JSON.stringify(result) + "\n");
' "$(IFS=,; printf '%s' "${failures[*]:-}")" \
  "$container_state" "$disk_percent" "$memory_percent" \
  "$backup_age_seconds" "$build_cache_bytes"

if (( ${#failures[@]} > 0 )); then
  exit 1
fi
