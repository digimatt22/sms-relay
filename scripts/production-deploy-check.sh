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
run npm run sheldon:validate

if [[ "${PACKAGE_GATEWAY:-1}" != "0" ]]; then
  run npm run gateway:package
fi

printf '\n==> database migrations are intentionally separate from application deployment\n'
printf '    run npm run db:migrate:production only under explicit migration authority\n'

printf '\nProduction deploy checks completed.\n'
