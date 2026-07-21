# ADR-001: Use Next.js + Postgres As The Recommended MVP Cloud Hub

## Status
Proposed

## Context
RelayHub SMS needs a central API, dashboard, database, logs, and gateway health views. MVP must run locally with up to 3 remote devices connected. The first hosted target is Vercel with managed Postgres.

## Decision
Use Next.js App Router + Postgres as the MVP stack. Run locally first. Use Vercel with managed Postgres as the first hosted deployment target. Keep AWS-native as a future alternate path, not an MVP blocker.

## Rationale
- The dashboard and API can be built together without a separate backend framework.
- Postgres supports claim/lease coordination, audit history, filtering, and dashboard reporting.
- The MVP scale target is low: 2-3 gateways and roughly 50 SMS/hour.
- The stack keeps implementation fast while leaving a clean path to Vercel hosting and possible AWS infrastructure later.

## Consequences
- API route handlers must be designed carefully for gateway polling and claim atomicity.
- Long-running work should remain on gateways or scheduled jobs, not request handlers.
- Local development must include Postgres setup and a reachable hub URL for remote gateway testing.

## References
- Next.js route handlers support custom HTTP request handlers.
- Vercel with managed Postgres is the first hosted target.
- AWS-native remains a future alternative.
