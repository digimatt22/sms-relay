# Relay Hub Historical Dump Cleanup

Status: prepared; **not authorized for execution**
Inventory captured: 2026-07-24

This runbook addresses previously packaged copies of
`relayhub-pre-019.dump`. It does not authorize release deletion, source-tree
mutation, image deletion, layer pruning, build-cache cleanup, or backup
deletion.

## Known release-source targets

All seven files were mode `0644`, size `84,385` bytes, and SHA-256
`615c955c16ab968ba6effbbb6644ee582c21e38512b4be8b1fa2a71b7d16f724`
when inventoried:

```text
/home/mwood/sheldon/apps/relayhub-sms/releases/20260722T211608Z/source/backups/relayhub-pre-019.dump
/home/mwood/sheldon/apps/relayhub-sms/releases/20260722T211847Z/source/backups/relayhub-pre-019.dump
/home/mwood/sheldon/apps/relayhub-sms/releases/20260722T212110Z/source/backups/relayhub-pre-019.dump
/home/mwood/sheldon/apps/relayhub-sms/releases/20260724T121853Z/source/backups/relayhub-pre-019.dump
/home/mwood/sheldon/apps/relayhub-sms/releases/20260724T135803Z/source/backups/relayhub-pre-019.dump
/home/mwood/sheldon/apps/relayhub-sms/releases/20260724T175917Z/source/backups/relayhub-pre-019.dump
/home/mwood/sheldon/apps/relayhub-sms/releases/20260724T181648Z/source/backups/relayhub-pre-019.dump
```

The ignored workspace copy has the same digest and has been hardened locally to
mode `0600`. It is not an off-host durability boundary and must not be treated
as the sole protected backup.

## Approval prerequisites

Before requesting cleanup approval:

1. create or identify the separately protected backup of record;
2. verify its mode is `0600` or stricter;
3. verify its SHA-256 and `pg_restore --list`;
4. complete an isolated restore check;
5. record the releases still eligible for application rollback;
6. inventory image layers and build cache without pruning;
7. present the exact quarantine targets and recovery location to Matthew.

## Approved-operation procedure

Only after explicit approval for the exact targets:

1. Acquire the Sheldon deployment lock.
2. Re-run the file inventory and require exact path, size, and digest matches.
3. Create a mode-`0700` quarantine directory outside all release sources.
4. Move only the approved files into quarantine, preserving release
   subdirectories so each move is reversible.
5. Confirm the current application and `/api/ready` remain healthy.
6. Inspect release manifests and image/build-layer references for the digest.
7. Stop and request separate approval before deleting the quarantine, deleting
   releases, removing images, or pruning build cache.

If any target differs from the recorded inventory, stop. Do not broaden the
path pattern or substitute a recursive cleanup.

## Recovery

Before quarantine deletion, recovery is a path-for-path move from the protected
quarantine back to the recorded release source. Recheck owner, mode, size, and
SHA-256 afterward. Application rollback does not require restoring these dump
copies; they are prohibited release artifacts, not application runtime files.

## Build cache

The historical Docker build may have retained the dump in an intermediate
layer because the old context allowed `backups/`. Cache and image cleanup are a
separate destructive gate. Inventory layer/cache IDs and dependency references
first. Never run a broad prune under this runbook.
