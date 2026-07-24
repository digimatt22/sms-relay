# Relay Hub Host Monitoring Contract

Status: implementation template; not installed

Relay Hub's internal `/api/alerts/process` endpoint is authenticated, writes to
Relay Hub's database, and depends on the application being available. It is
appropriate for gateway, queue, send, and callback conditions, but it cannot
detect or report the loss of Relay Hub itself.

The host watchdog runs as a Sheldon user systemd timer outside all application
containers. It checks:

- public HTTPS liveness and database-backed readiness;
- the expected Relay Hub container state;
- host disk and memory thresholds;
- protected backup age;
- a non-sensitive digest of the current Docker build-cache inventory.

Machine-readable results go to the host journal. They contain identifiers and
recovery categories only—never environment values, database URLs, credentials,
phone numbers, message bodies, or customer data.

## Independent fallback gate

The systemd unit uses `OnFailure` to call
`relayhub-independent-fallback@.service`. The adapter at
`/usr/local/libexec/relayhub-independent-fallback` must use a channel operated
independently of Relay Hub, its PostgreSQL service, and the Sheldon application
network. Matthew must select the channel and confirm a received test before
these units are installed or enabled.

Until that decision is complete:

- keep `independent_fallback_selected` false in `sheldon.json`;
- do not install or enable the systemd templates;
- do not route Relay Hub self-outage alerts through Relay Hub SMS alone.

## Installation gate

Installing scripts, environment files, fallback credentials, or systemd units
changes live host state and requires explicit approval. Before requesting it:

1. review the adapter implementation and destination;
2. store adapter credentials in a mode-`0600` host file;
3. set the protected backup stamp path and thresholds;
4. run the watchdog against a controlled failure;
5. confirm the independent notification was received;
6. verify journal output contains no prohibited data.

The watchdog does not prune build cache, delete backups, restart containers, or
perform rollback. Those remain separate approval-gated operations.
