# Relay Hub Host Monitoring Contract

Status: implementation template; not installed

Relay Hub's internal `/api/alerts/process` endpoint is authenticated, writes to
Relay Hub's database, and depends on the application being available. It is
appropriate for gateway, queue, send, and callback conditions, but it cannot
detect or report the loss of Relay Hub itself.

The host watchdog runs as a Sheldon user systemd timer outside all application
containers. It checks:

- public HTTPS liveness and database-backed readiness;
- the expected Relay Hub application and PostgreSQL container states;
- the declared PostgreSQL persistent volume;
- host disk and memory thresholds;
- protected backup age;
- public certificate validity beyond the configured threshold;
- current-release existence and optional expected-release drift;
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

The reviewed adapter source is
`scripts/relayhub-independent-fallback.py`. It sends a redacted, deduplicated
JSON event to a user-selected external HTTPS webhook. It rejects Relay Hub's
own hostname, localhost, literal private addresses, non-HTTPS destinations, and
live delivery until `RELAYHUB_FALLBACK_CONFIRMED_INDEPENDENT=true`. It never
logs the webhook URL, bearer token, response body, customer data, phone number,
or message content.

Until that decision is complete:

- keep `independent_fallback_selected` false in `sheldon.json`;
- do not install or enable the systemd templates;
- do not route Relay Hub self-outage alerts through Relay Hub SMS alone.

## Installation gate

Installing scripts, environment files, fallback credentials, or systemd units
changes live host state and requires explicit approval. Before requesting it:

1. review the adapter implementation and destination;
2. copy `config/relayhub-fallback.example` to the host EnvironmentFile, replace
   the placeholder values, and keep it mode `0600`;
3. install the adapter as
   `/usr/local/libexec/relayhub-independent-fallback`;
4. leave dry-run enabled and confirm the emitted payload is redacted;
5. copy `config/relayhub-host-watchdog.example` to the host EnvironmentFile and
   confirm the rootless Docker context, application/PostgreSQL container names,
   PostgreSQL volume, protected backup stamp, certificate threshold, current
   release link, and resource thresholds;
6. set `RELAYHUB_FALLBACK_CONFIRMED_INDEPENDENT=true`, disable dry-run, and
   send a controlled test;
7. confirm the independent notification was received;
8. run the watchdog against a controlled failure;
9. verify deduplication and confirm journal output contains no prohibited data.

Steps 2 through 8 modify live host state or contact an external provider and
remain explicitly approval gated.

The watchdog does not prune build cache, delete backups, restart containers, or
perform rollback. Those remain separate approval-gated operations.
