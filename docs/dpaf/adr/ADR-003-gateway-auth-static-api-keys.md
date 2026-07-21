# ADR-003: Use Static API Keys Per Gateway For MVP

## Status
Proposed

## Context
Gateway device management should be easy. The user prefers static API keys per gateway unless a better easy-to-manage flow is identified.

## Decision
Use one static API key per gateway for MVP. Store only hashed keys in the cloud database. Show plaintext keys once at creation/rotation time.

## Rationale
- Simple to provision and debug.
- Good enough for a controlled fleet of 2-3 MVP gateways.
- Rotation and revocation can be implemented from the admin dashboard.

## Consequences
- Key leakage allows gateway impersonation until revoked.
- Dashboard must support revoke/rotate operations.
- Future phases may move to mTLS or device registration certificates if fleet size or risk increases.
