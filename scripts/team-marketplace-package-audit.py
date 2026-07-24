#!/usr/bin/env python3
"""Run the team-marketplace Sheldon release-safety audit for schema-2 source."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys


DEFAULT_MARKETPLACE = Path(
    "/Users/mwood/Documents/Digicolony/digicolony-codex-marketplace"
)
MINIMUM_RELEASE_SAFETY_VERSION = (0, 1, 1)


def version_tuple(value: str) -> tuple[int, ...]:
    try:
        return tuple(int(part) for part in value.split("."))
    except ValueError as exc:
        raise RuntimeError(f"invalid marketplace plugin version: {value}") from exc


def load_release_module(script_path: Path):
    spec = importlib.util.spec_from_file_location(
        "team_marketplace_sheldon_deploy", script_path
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load team-marketplace Sheldon tool: {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def git_commit(repository: Path) -> str:
    return subprocess.run(
        ["git", "-C", str(repository), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-dir", default=".")
    parser.add_argument("--output", required=True)
    parser.add_argument("--expected-commit")
    parser.add_argument(
        "--marketplace-root",
        default=os.environ.get(
            "SHELDON_TEAM_MARKETPLACE_ROOT", str(DEFAULT_MARKETPLACE)
        ),
    )
    args = parser.parse_args()

    project = Path(args.project_dir).resolve()
    output = Path(args.output).resolve()
    marketplace = Path(args.marketplace_root).resolve()
    plugin_root = marketplace / "plugins" / "sheldon-deploy"
    plugin_manifest_path = plugin_root / ".codex-plugin" / "plugin.json"
    deploy_script = (
        plugin_root
        / "skills"
        / "deploy-to-sheldon"
        / "scripts"
        / "deploy.py"
    )
    if not plugin_manifest_path.is_file() or not deploy_script.is_file():
        raise RuntimeError(
            "team-marketplace Sheldon plugin is unavailable; installed caches are not accepted"
        )

    plugin_manifest = json.loads(plugin_manifest_path.read_text())
    plugin_version = plugin_manifest["version"]
    if version_tuple(plugin_version) < MINIMUM_RELEASE_SAFETY_VERSION:
        raise RuntimeError(
            f"team-marketplace Sheldon {plugin_version} lacks exact-source package auditing"
        )

    relay_manifest = json.loads((project / "sheldon.json").read_text())
    if relay_manifest.get("schema") != 2:
        raise RuntimeError("Relay Hub candidate must use Sheldon schema 2")

    # Sheldon 0.1.1 exposes the exact-source safety engine but its CLI parser is
    # schema-1-only. Reuse that marketplace engine with the two fields it needs;
    # this is an audit only and must never be treated as schema-2 deployment
    # support.
    compatibility_manifest = {
        "dockerfile": relay_manifest["services"]["app"]["build"]["dockerfile"],
        "release": {"generated_allowlist": []},
    }
    module = load_release_module(deploy_script)
    source_commit, files = module.release_inventory(
        project, compatibility_manifest
    )
    if args.expected_commit and source_commit != args.expected_commit:
        raise RuntimeError(
            f"audited commit {source_commit} does not match expected {args.expected_commit}"
        )

    inventory = module.inventory_document(source_commit, files)
    document = {
        "audit_schema": 1,
        "candidate_contract": relay_manifest["contract"],
        "candidate_manifest_schema": relay_manifest["schema"],
        "tool": {
            "source": "team-marketplace",
            "plugin": plugin_manifest["name"],
            "version": plugin_version,
            "marketplace_commit": git_commit(marketplace),
            "schema2_deployment_supported": version_tuple(plugin_version) >= (0, 2, 0),
            "compatibility_audit_only": version_tuple(plugin_version) < (0, 2, 0),
        },
        "inventory": inventory,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, indent=2) + "\n")
    output.chmod(0o600)
    print(f"team_marketplace_package_audit={output}")
    print(f"source_commit={source_commit}")
    print(f"source_digest={inventory['source_digest']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
