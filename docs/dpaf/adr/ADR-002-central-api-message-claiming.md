# ADR-002: Gateways Claim Messages Through The Central API

## Status
Proposed

## Context
Multiple remote gateways must send outbound SMS without duplicate delivery. MVP duplicate prevention is best effort, and failover means reassigning stuck messages after timeout.

## Decision
Gateways must claim messages through a central API endpoint backed by Postgres transaction semantics.

## Rationale
- Centralized claiming avoids direct database credentials on appliances.
- Claim leases make failover straightforward.
- The API can enforce gateway auth, disabled-device checks, status transitions, and audit logging.

## Consequences
- Gateway appliances require network access to the cloud hub.
- Database transactions and indexes are critical for avoiding duplicate active claims.
- Exactly-once delivery is not guaranteed for MVP; this must stay visible in docs and UI.
