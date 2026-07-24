# Relay Hub Sheldon 0.2.0 Objective Matrix

Status: local implementation and dry-run complete; live gates not authorized

| # | Objective | Evidence | Status |
|---|---|---|---|
| 1 | Branch and active plan | `codex/relayhub-sheldon-0-2-migration`; active execution plan | Complete |
| 2 | Schema-2 manifest | `sheldon.json` validates as schema 2 and contract `sheldon-deploy/0.2.0` | Locally complete; marketplace 0.2.0 publication pending |
| 3 | Exact clean commit | Detached-worktree release candidate, checksum, provenance, and inventory audit | Complete after final candidate evidence |
| 4 | Exclude sensitive artifacts | Git inventory, package policy, Docker context policy, and team-marketplace audit | Complete |
| 5 | Historical dump cleanup | Exact seven-copy cleanup runbook; no deletion performed | Prepared; approval gated |
| 6 | Application-owned PostgreSQL | PostgreSQL service/volume contract and isolated drill | Prepared; live creation approval gated |
| 7 | Preserve PostgreSQL major | PostgreSQL 17.10 source and target; manifest forbids implicit major upgrade | Complete |
| 8 | Preserve data semantics | Ledger, protected counts, relationships, consent, STOP, credentials, queue/history comparisons | Dry-run complete |
| 9 | Separate roles | Cluster admin, non-super owner/migrator, non-owning runtime role | Dry-run complete; live creation gated |
| 10 | Operational declarations | Limits, timeouts, health, backup, restore-check, resources, and persistent volume | Complete |
| 11 | Separate migrations | One-shot migration process and separately gated owner credential | Complete |
| 12 | Dry-run migration | Protected backup, isolated restore, comparisons, rollback, and 20-minute estimate | Complete |
| 13 | Host monitoring | External watchdog/systemd contract | Prepared; independent fallback selection/test pending |
| 14 | SMS success/failures | Non-sending authorized path plus consent, STOP, credential, and database failures | Complete |
| 15 | Commit and push phases | Phase commits and remote branch evidence | Complete after final phase push |
| 16 | Automatic local work | Implementation, build, tests, restore drill, and candidate audit | Complete after final candidate |
| 17 | Stop before live changes | No cleanup, live DB/secret/write/container/data/deploy/rollback mutation performed | Enforced |

The production cutover is intentionally incomplete. It cannot proceed until
the marketplace publishes and validates Sheldon Deploy 0.2.0, the independent
fallback alert is selected and tested, and the user grants each explicit live
approval in `docs/runbooks/relayhub-production-cutover.md`.
