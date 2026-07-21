#!/usr/bin/env bash
set -euo pipefail

run() {
  printf '\n==> %s\n' "$*"
  "$@"
}

run npm run typecheck
run npm test
run npm run gateway:build
run npm run build

if [[ "${PACKAGE_GATEWAY:-1}" != "0" ]]; then
  run npm run gateway:package
fi

if [[ -n "${DATABASE_URL:-}" && "${RUN_MIGRATIONS:-0}" == "1" ]]; then
  run npm run db:migrate
else
  printf '\n==> skipping migrations; set RUN_MIGRATIONS=1 with DATABASE_URL to apply them\n'
fi

printf '\nProduction deploy checks completed.\n'
