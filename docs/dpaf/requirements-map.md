# Requirements Map

## Purpose
Track confirmed, inferred, and unresolved requirements before PRD compilation.

## Confirmed Functional Requirements
| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| FR-001 | The system must support outbound SMS sending through SIM7070 modules. | Confirmed | SOW, discovery |
| FR-002 | The system must include central API services that run locally for MVP and can later deploy to Vercel. | Confirmed | Discovery |
| FR-003 | The system must create and own the database structure. | Confirmed | Discovery |
| FR-004 | The API must allow inserting an outbound SMS message. | Confirmed | Discovery |
| FR-005 | Gateway appliances must claim messages through the central API. | Confirmed | Discovery |
| FR-006 | Gateways must update the central API with carrier-submitted status and timestamps. | Confirmed | SOW, discovery |
| FR-007 | The system must support multiple remote gateways. | Confirmed | SOW, discovery |
| FR-008 | The system must provide best-effort duplicate prevention for MVP. | Confirmed | Discovery |
| FR-009 | The system must reassign stuck claimed messages after timeout. | Confirmed | Discovery |
| FR-010 | Gateway health and logs must be sent to the central API. | Confirmed | Discovery |
| FR-011 | The dashboard/operator UI must show operational state from the central API. | Confirmed | Discovery |
| FR-012 | The gateway appliance must support wired or wireless network connectivity to the central hub. | Confirmed | Discovery |
| FR-013 | Admin users must be able to create/send messages from the dashboard for MVP testing. | Confirmed | Discovery |
| FR-014 | Message insertion must support destination, body, priority, scheduled time, idempotency key, flexible metadata, and callback URL; customer/account references live in metadata for MVP. | Confirmed | Discovery |
| FR-015 | Dashboard auth is admin-only for MVP, with future role expansion. | Confirmed | Discovery |
| FR-016 | MVP must prove 2-3 gateways. | Confirmed | Discovery |
| FR-017 | MVP dashboard authentication must use Auth.js/NextAuth.js with local database-backed admin credentials. | Confirmed | Discovery |
| FR-018 | MVP gateway hardware is Raspberry Pi Zero 2 W with the selected SIM7070G module. | Confirmed | Discovery |
| FR-019 | The system must distinguish carrier submission from handset delivery and retain delivery receipt evidence where the carrier supplies it. | Confirmed | 2026-07-22 direction |
| FR-020 | Client integrations must have first-class conversation threads with external workflow correlation. | Confirmed | SwimSense/Stratus integration direction |
| FR-021 | Webhook subscriptions and event delivery must be scoped to the exact API key. | Confirmed | 2026-07-22 direction |
| FR-022 | The platform must publish a durable, versioned, complete lifecycle event contract. | Confirmed | 2026-07-22 direction |
| NFR-016 | AWS SNS and Twilio must not be configured as SMS fallback transports. | Confirmed | 2026-07-22 direction |
| FR-019 | Dashboard must be served at `https://sns.digicolony.net`. | Confirmed | Discovery |
| FR-020 | Installer must be served at `https://sns.digicolony.net/install`. | Confirmed | Discovery |

## Confirmed Non-Functional Requirements
| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| NFR-001 | Do not constrain MVP architecture to Raspberry Pi. | Confirmed | Discovery |
| NFR-002 | Do not constrain MVP architecture to Python. | Confirmed | Discovery |
| NFR-003 | Keep the design modular enough for future load balancing. | Confirmed | SOW, discovery |
| NFR-004 | Static API keys per gateway are preferred for ease of device management. | Confirmed | Discovery |
| NFR-005 | Cloud hub must support centralized logs and health data for dashboard use. | Confirmed | Discovery |
| NFR-006 | MVP target throughput is approximately 50 SMS/hour. | Confirmed | Discovery |
| NFR-007 | Central logs must be retained for 90 days. | Confirmed | Discovery |
| NFR-008 | SIM activation, cellular plans, provider accounts, and hardware purchasing are out of scope. | Confirmed | Discovery |
| NFR-009 | Vercel with managed Postgres is the first hosted target after local MVP. | Confirmed | Discovery |
| NFR-010 | Gateway runtime is TypeScript/Node for MVP. | Confirmed | Discovery |
| NFR-011 | Gateway heartbeat must be configurable in the 1-5 minute range. | Confirmed | Discovery |
| NFR-012 | Logs must redact phone numbers, preserving only the last 4 digits. | Confirmed | Discovery |
| NFR-013 | Dashboard-only health is sufficient for MVP; external alerts are future scope. | Confirmed | Discovery |
| NFR-014 | SMS body may be included in MVP logs. | Confirmed | Discovery |
| NFR-015 | SIM7070G primary connection is Raspberry Pi expansion header with GPIO/UART assumption; USB serial is fallback if supported. | Confirmed | Discovery |

## Inferred Requirements
| ID | Requirement | Status | Notes |
| --- | --- | --- | --- |
| IR-001 | Gateway API keys need create, rotate, revoke, and audit support. | Inferred | Required to make static keys operationally safe. |
| IR-002 | Message records need lease owner, lease expiration, attempt count, and status fields. | Inferred | Required for central claim and timeout failover. |
| IR-003 | The gateway service needs a mock modem mode for development and CI. | Inferred | SOW requires mock API/database; hardware integration also needs test seams. |
| IR-004 | Dashboard auth should preserve future Auth0 migration optionality. | Inferred | MVP uses local database-backed Auth.js/NextAuth.js credentials. |
| IR-005 | Raspberry Pi Zero 2 W is the MVP appliance target. | Inferred | Selected to avoid Pi Zero W ARMv6 runtime concerns while retaining low-cost Raspberry Pi-class hardware. |

## Open Requirement Decisions
- No open requirement decisions block MVP kickoff.
