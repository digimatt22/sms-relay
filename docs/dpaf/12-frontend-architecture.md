# Frontend Architecture

Status: Draft.

## Recommended Stack
Use Next.js App Router with TypeScript. The dashboard should prioritize dense operational views over marketing-style layouts.

Next.js route handlers are a good fit for colocating MVP API endpoints with the dashboard when using the Next.js + Postgres path. The official Next.js docs describe route handlers as custom request handlers using standard Request/Response APIs and supporting HTTP methods including GET, POST, PUT, PATCH, and DELETE.

## Dashboard Scope
MVP dashboard is admin-only using Auth.js/NextAuth.js with local database-backed credentials. The data model and navigation should allow future operator/read-only roles and future Auth0 integration.

## Pages
- `/login`: admin sign-in.
- `/`: redirect to queue dashboard.
- `/messages`: queue table with filters, status counts, and create-message action.
- `/messages/new`: create/send message test surface.
- `/messages/[id]`: message detail, attempts, claim state, errors, metadata.
- `/gateways`: gateway fleet table with online/degraded/offline state.
- `/gateways/[id]`: gateway health, modem/SIM info, recent logs, recent attempts.
- `/logs`: cross-gateway log search/filter view.
- `/settings/gateways`: create gateway, rotate/revoke API keys.

## Component Model
- Server components for data-heavy list/detail pages.
- Client components for filters, forms, polling controls, and actions.
- Route handlers or server actions for admin mutations, depending on implementation preference.

## UX Notes
- Queue and gateway pages should be compact and scan-friendly.
- SMS body is visible to MVP admins in the admin UI.
- SMS body may appear in MVP logs visible to admins.
- Logs and diagnostics must redact phone numbers, preserving only last 4 digits.
- Health should show last heartbeat age prominently.
- Stuck/expired claims should be visible to admins.

## Open Questions
- No blocking frontend questions remain.
