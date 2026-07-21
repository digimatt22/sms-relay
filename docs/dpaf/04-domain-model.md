# Domain Model

Status: Draft.

## Candidate Entities
- Message
- Gateway
- Gateway API key
- SIM7070 modem
- SIM card
- Carrier/APN profile
- Delivery attempt
- Message lease/claim
- Delivery status update
- Retry policy
- Health check
- Gateway log event
- Operator user
- Dashboard alert

## Core Relationships
- A message has zero or more delivery attempts.
- A message may have one active gateway claim at a time.
- A gateway has one active API key hash and may have rotated/revoked historical keys in a future audit table.
- A gateway emits many health samples and log events.
- An admin user may create messages and manage gateways.

## Notes
- `metadata` on messages should remain JSONB to support flexible use-case-specific fields.
- Customer/account partitioning is not fully defined; store customer/account references inside message `metadata` for MVP.
