#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-}"
if [[ -z "$output_dir" || "$output_dir" != /* ]]; then
  printf 'usage: scripts/release-candidate.sh /absolute/output/directory\n' >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
case "$output_dir" in
  "$repo_root"|"$repo_root"/*)
    printf 'release output must be outside the Git worktree\n' >&2
    exit 1
    ;;
esac
if [[ -d "$output_dir" ]] && [[ -n "$(find "$output_dir" -mindepth 1 -print -quit)" ]]; then
  printf 'release output directory must be empty\n' >&2
  exit 1
fi
if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  printf 'release candidate requires a clean primary worktree\n' >&2
  exit 1
fi

commit="$(git rev-parse HEAD)"
temp_root="$(mktemp -d "${TMPDIR:-/tmp}/relayhub-release-worktree.XXXXXX")"
source_worktree="$temp_root/source"

cleanup() {
  status=$?
  if [[ -e "$source_worktree/.git" ]]; then
    git worktree remove --force "$source_worktree" >/dev/null 2>&1 || true
  fi
  rm -rf "$temp_root"
  return "$status"
}
trap cleanup EXIT

umask 077
mkdir -p "$output_dir"
git worktree add --detach "$source_worktree" "$commit" >/dev/null

python3 "$source_worktree/scripts/team-marketplace-package-audit.py" \
  --project-dir "$source_worktree" \
  --expected-commit "$commit" \
  --output "$output_dir/team-marketplace-package-audit.json"

node "$source_worktree/scripts/release-policy.mjs" \
  package "$output_dir" "$commit"
