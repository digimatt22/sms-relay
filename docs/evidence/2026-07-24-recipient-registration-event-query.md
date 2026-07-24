# Recipient Registration Event Query Evidence

Date: 2026-07-24
Production mutation: not performed

## Reported behavior

The hosted registration form for **MattMadeMe System Notifications** returned a
database-column error after the recipient submitted the consent form. A
read-only trace found:

- the MattMadeMe program was active with public enrollment enabled;
- the recipient authorization request was recorded;
- the verification SMS was queued;
- the challenge-sent authorization audit event was recorded;
- platform-event publication failed;
- the error handler then marked the challenge failed and the authorization
  `verification_expired`;
- no platform event was created for the registration.

The failed attempt left one queued verification message whose challenge is no
longer valid. Canceling that production message is a separate data mutation and
was not performed.

## Root cause

`resolveEventSource` in `src/lib/event-contract.ts` used two physical column
names that do not exist on `recipient_authorizations`:

- `authorized_at` should be the event-contract alias of `verified_at`;
- `expires_at` belongs to the latest `verification_challenges` row, not the
  authorization row.

Migration 019 and its runtime grants were present. Its actual delivery columns
also existed:

- `messages.delivery_status_updated_at`;
- `message_attempts.delivery_reported_at`.

The previously corrected message query already aliases
`delivery_status_updated_at AS delivery_reported_at`. No database migration,
role change, or secret change is required for this repair.

## Repair

The authorization event-source query now:

- aliases `a.verified_at AS authorized_at`;
- uses a lateral join to the latest verification challenge for
  `challenge.expires_at`;
- leaves the external event envelope field names unchanged.

## Validation

The PostgreSQL 17 isolated-restore drill was expanded to run the real hosted
registration path. It now proves:

- challenge status remains `pending`;
- verification SMS status is `queued`;
- `recipient.authorization.challenge_sent` is published to
  `platform_events`;
- valid and invalid API credential checks still pass;
- an already-authorized SMS queues with the non-sending adapter;
- missing consent and STOP suppression remain enforced;
- unavailable database readiness remains a generic HTTP 503.

The final isolated run passed all 28 schema/ledger/count/relationship checks
with zero discrepancies and completed in two seconds. Raw mode-0600 evidence
is outside the repository at
`/private/tmp/relayhub-restore-evidence-authorized-at-fix-r3`.

Production deployment and cancellation of the invalid queued verification
message remain explicit approval gates.
