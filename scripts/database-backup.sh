#!/usr/bin/env bash
set -euo pipefail

: "${SOURCE_BACKUP_DATABASE_URL:?SOURCE_BACKUP_DATABASE_URL is required}"

backup_path="${1:-}"
if [[ -z "$backup_path" || "$backup_path" != /* ]]; then
  printf 'usage: scripts/database-backup.sh /absolute/protected/path.dump\n' >&2
  exit 1
fi
case "$backup_path" in
  "$PWD"/*)
    printf 'backup path must be outside the repository\n' >&2
    exit 1
    ;;
esac
if [[ -e "$backup_path" ]]; then
  printf 'backup target already exists; refusing to overwrite it\n' >&2
  exit 1
fi

backup_dir="${backup_path%/*}"
umask 077
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
pg_dump "$SOURCE_BACKUP_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$backup_path"
chmod 600 "$backup_path"
pg_restore --list "$backup_path" >/dev/null
sha256sum "$backup_path"
