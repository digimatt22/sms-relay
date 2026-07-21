# ADR-005: Use Auth.js/NextAuth.js Local Database Auth For MVP

## Status
Proposed

## Context
The MVP dashboard is admin-only. The project should keep authentication simple for local development and MVP testing, while preserving the ability to expand to Auth0 later.

## Decision
Use Auth.js/NextAuth.js with local database-backed admin credentials for MVP. Keep Auth0 as a future provider option.

## Rationale
- Fits the Next.js + Postgres stack.
- Works for local MVP operation without an external identity provider.
- Keeps admin access simple while the product is still internal.
- Auth.js supports Credentials-style authentication and Auth0 as a provider path.

## Consequences
- Local credentials require secure password hashing, session handling, and seed/invite discipline.
- Future Auth0 migration should be considered when modeling users and roles.
- MVP should not overbuild role management beyond admin, but the schema should allow `operator` and `read_only` later.
