# Recipient Authorization, Verification, and Opt-Out Plan

Status: Implemented launch baseline; legal copy and production policy still require counsel approval
Date: 2026-07-21
Target: DigiColony SNS

## Launch Decisions (Approved Product Baseline)

- DigiColony SNS is replacing AWS SNS for a small, explicitly approved set of known clients.
- Ordinary client messages are denied unless the recipient has completed double opt-in for an active messaging program.
- Clients can embed the authorization API in their own forms; DigiColony also hosts a public consent form for workflows without a client signup surface.
- Existing/cold-list consent import is not exposed at launch. Recipients must enter through the hosted or client-embedded flow.
- A messaging program created by an organization administrator remains pending until a platform administrator approves it.
- STOP is client-wide across every program, gateway, SIM, and API key belonging to that client. It is never gateway-scoped.
- An unattributable or cross-client-ambiguous STOP creates a platform-wide suppression for the number. Only a reviewed administrative process may resolve that failsafe.
- START reactivates only the uniquely attributable client and program. Broad replies such as `YES` do not reactivate authorization.
- Verification, security, and the one required opt-out confirmation use server-controlled exceptions. Clients cannot request or encode an authorization bypass.
- Approved verification copy is generated and versioned by DigiColony; clients may configure only the sender identity, program purpose, expected frequency, and help/contact fields.

## Purpose

Prevent clients from sending ordinary SMS messages to a phone number until DigiColony SNS has an auditable authorization record and has verified that the enrolling recipient controls the number. Pair that gate with immediate, client-scoped STOP enforcement and a platform-wide failsafe when sender attribution is ambiguous.

This document is an engineering and product plan, not legal advice. Qualified counsel must approve the consent language, message classifications, retention period, exceptions, and jurisdiction policy before production rollout.

## Source Inputs

- Existing organization-scoped `opt_outs` schema and inbound STOP handling.
- Existing `/api/messages`, gateway claim, inbound ingestion, callback, and event-log implementation.
- FCC consent and revocation orders.
- CTIA Messaging Principles and Best Practices.
- FCC Reassigned Numbers Database guidance.
- Product direction in the current conversation.

Primary references:

- [FCC 2012 prior express written consent order](https://docs.fcc.gov/public/attachments/FCC-12-21A1.pdf)
- [FCC 2024 consent revocation order](https://docs.fcc.gov/public/attachments/FCC-24-24A1.pdf)
- [FCC January 2026 limited revoke-all waiver](https://docs.fcc.gov/public/attachments/DA-26-12A1.pdf)
- [Eleventh Circuit decision vacating the FCC's 2023 one-to-one lead rule](https://media.ca11.uscourts.gov/opinions/pub/files/202410277.pdf)
- [CTIA informed opt-in and opt-out guidance](https://www.ctia.org/news/political-text-messaging-engaging-and-organizing-voters-while-protecting-consumers)
- [FCC Reassigned Numbers Database guidance](https://docs.fcc.gov/public/attachments/DA-22-378A1.pdf)

## Facts

- Phone possession verification and legal consent are different facts.
- An OTP proves that someone can receive a message at a number; it does not by itself prove consent to future marketing or unrelated messaging.
- A verification text can itself be an unwanted first-contact text if the recipient did not initiate or authorize it.
- Consent must be associated with the represented client/sender and the disclosed messaging purpose.
- Gateway/SIM selection is a transport decision and must not change authorization or suppression scope.
- SMS replies do not contain an identifier for the outbound message being answered. Shared sender numbers can therefore make client attribution ambiguous.
- The `opt-in` implementation provides the authorization state machine, client-wide suppression, ambiguous STOP failsafe, and repeated send-boundary enforcement described here.

## Recommended Decisions

1. Require a DigiColony authorization record for ordinary client-originated messages.
2. Require number-control verification for every newly enrolled recipient before ordinary sending is enabled.
3. Do not allow a client API call alone to assert verification or mark a recipient authorized.
4. Permit a verification challenge only after the client attests that the recipient initiated the flow or after a separately approved consent-import path supplies evidence.
5. Scope authorization and ordinary STOP suppression to `(organization, recipient, messaging program)`; apply a client-wide suppression across all programs when the consumer requests all messages from that client to stop.
6. Never scope consent or STOP to a gateway.
7. Add a platform-wide safety suppression when an inbound STOP cannot be reliably attributed to one client.
8. Enforce authorization and suppression when a message is accepted and again immediately before gateway claim/send.
9. Remove client-controlled opt-out overrides. Any exceptional send must use a separate, server-controlled workflow approved by platform policy and recorded immutably.
10. Allow limited client branding through approved templates and variables. Do not accept an arbitrary verification-message body.
11. Keep the verification message informational and free of marketing content.
12. Use immediate enforcement even when a regulation permits a longer processing window.

## Consent Classes

Every messaging program must declare one class. Counsel must approve the final classification matrix.

| Class | Examples | Default authorization requirement |
| --- | --- | --- |
| Marketing | Promotions, sales, fundraising, recurring campaigns | Prior express written consent plus number verification |
| Informational recurring | Account updates, reminders, operational notifications | Documented prior express consent plus number verification |
| User-requested transactional | A response or code the consumer just requested | Record the initiating request; restrict content and duration |
| Security | Password reset or account verification initiated by the account holder | Existing account relationship plus explicit request; rate limited |
| Emergency/exempt | Narrow legally recognized exceptions | Disabled by default until counsel defines the exception and controls |

Authorization for one program or purpose must not silently authorize unrelated programs. The client account remains the sender identity; API apps, API keys, gateways, and SIMs are not independent consent owners.

## Enrollment Paths

### Path A: Hosted double opt-in — recommended default

1. Client creates a messaging program with approved sender identity, purpose, disclosure, help contact, privacy URL, terms URL, and template.
2. Consumer opens a DigiColony-hosted or embedded consent surface from the client's application.
3. The surface displays the client identity, purpose, expected frequency, opt-out method, help method, applicable rate disclosure, terms, privacy notice, and whether consent is a condition of purchase.
4. Consumer enters the phone number and performs an affirmative action. No pre-checked consent control is allowed.
5. DigiColony records the exact disclosure version and creates a short-lived verification challenge.
6. DigiColony sends one approved verification message.
7. Consumer enters the OTP or replies with the approved affirmative keyword.
8. DigiColony marks the authorization `verified_authorized`, emits a signed callback, and allows ordinary messages for the approved scope.

### Path B: Client-embedded/API double opt-in

1. Client presents a DigiColony-approved disclosure in its own application.
2. Consumer affirmatively requests enrollment.
3. Client calls the authorization API with the disclosure version, evidence reference, acquisition timestamp, source, program, and recipient reference.
4. Client attests that the recipient initiated the challenge and that the submitted evidence is accurate.
5. DigiColony sends the approved verification challenge and completes the flow as in Path A.

This path carries more client compliance risk. DigiColony should retain audit and suspension rights and rate-limit challenge creation per client, program, IP/risk signal, and recipient.

### Path C: Existing-consent import

- Do not use this path for cold lists.
- Require a separate endpoint, explicit client attestation, disclosure/evidence metadata, acquisition date, sender identity, purpose, and counsel-approved policy.
- Imported consent is not automatically number-verified.
- Recommended rollout behavior: mark imported records `verification_required` and require a recipient-initiated verification before new campaigns.
- Any legacy grace period is a blocking legal and product decision.

### Path D: Inbound opt-in

- Permit an inbound `START` or approved affirmative response only when it can be attributed to a client/program and follows a disclosed enrollment prompt.
- Record the inbound message, receiving gateway, matched prompt, disclosure version, and resulting authorization event.
- Ambiguous `START` must not globally reactivate unrelated clients or programs.

## Authorization State Machine

| State | Meaning | Ordinary outbound allowed? |
| --- | --- | --- |
| `unverified` | Recipient exists but has no active authorization | No |
| `challenge_pending` | Verification was requested and has not completed | No |
| `verified_authorized` | Disclosure accepted and number control verified | Yes, within approved scope |
| `verification_expired` | Challenge expired or attempts exhausted | No |
| `revoked` | Consent was withdrawn through STOP or another reasonable method | No |
| `suppressed` | Client-wide or platform failsafe suppression is active | No |
| `reverification_required` | Risk, reassignment signal, material disclosure change, or policy requires a new flow | No |

Transitions must be append-only events even when the current state is stored for efficient enforcement.

## Verification Message Policy

### Required template content

- Approved client/sender identity.
- Statement that the message verifies a recipient-requested enrollment.
- OTP or affirmative action.
- Program/purpose summary.
- STOP and HELP instructions.
- Required rate/frequency disclosure as approved by counsel and carrier policy.
- No promotion, offer, coupon, or unrelated content.

Example structure for review, not approved legal copy:

```text
{client_name}: Verify your request for {program_name} texts. Code {code}. {frequency_notice} Reply STOP to cancel or HELP for help. {rate_notice}
```

### Customization rules

Clients may configure only approved fields:

- display name;
- program name and short purpose;
- expected frequency from a controlled set;
- help contact or approved URL;
- locale;
- an optional short introductory phrase approved during template review.

Clients may not change or remove the sender identity, verification instruction, STOP/HELP language, or mandatory disclosures. Every approved template version must be immutable and content-hashed. Changes create a new version and may trigger re-consent if the purpose or scope materially changes.

## API Plan

All writes require an API key belonging to the active organization. Use idempotency keys for challenge creation, confirmation, revocation, and import.

### Messaging programs

- `POST /api/messaging-programs`
- `GET /api/messaging-programs`
- `GET /api/messaging-programs/{id}`
- `PATCH /api/messaging-programs/{id}`
- `POST /api/messaging-programs/{id}/approve` (platform administrator)

Program fields include sender identity, class, purpose, consent/disclosure version, approved template version, help contact, terms/privacy URLs, status, and callback configuration.

### Recipient authorization

- `POST /api/recipient-authorizations`
  - Creates a consent intent and, when policy permits, sends a verification challenge.
  - Requires `programId`, normalized phone number, client recipient reference, consent source, acquired/requested timestamp, disclosure version, evidence reference, recipient-initiated attestation, locale, callback URL, and idempotency key.
  - Returns `202` with an authorization ID, non-secret status, and challenge expiry.
- `POST /api/recipient-authorizations/{id}/confirm`
  - Confirms an OTP supplied by the recipient.
  - Rate limited; never returns the stored OTP or hash.
- `POST /api/recipient-authorizations/{id}/resend`
  - Applies cooldown and hourly/daily limits.
- `GET /api/recipient-authorizations/{id}`
  - Returns status, scope, timestamps, disclosure version, and redacted phone number.
- `POST /api/recipient-authorizations/{id}/revoke`
  - Records revocation from a non-SMS reasonable method and applies suppression immediately.
- `POST /api/recipient-authorizations/import`
  - Separate privileged policy for existing evidence; disabled until approved.

### Message creation changes

`POST /api/messages` must require `programId`. Before accepting an ordinary message it must verify:

1. the program is active and belongs to the authenticated organization;
2. the recipient has an active authorization for the program/purpose;
3. no client-wide or platform-wide suppression applies;
4. the authorization was not superseded, revoked, expired by policy, or marked for reverification;
5. the requested message class matches the program;
6. the client cannot set a metadata flag that bypasses these checks.

Recommended errors:

- `recipient_authorization_required` — `403`
- `recipient_verification_pending` — `409`
- `recipient_opted_out` — `403`
- `recipient_platform_suppressed` — `403`
- `program_not_active` — `409`
- `program_scope_mismatch` — `400`

### Callbacks

Signed, idempotent events:

- `recipient.authorization.challenge_sent`
- `recipient.authorization.verified`
- `recipient.authorization.expired`
- `recipient.authorization.revoked`
- `recipient.authorization.reverification_required`
- `recipient.opt_out.recorded`
- `recipient.opt_in.recorded`

Payloads include event ID, organization ID, program ID, client recipient reference, authorization ID, redacted phone number, status, reason code, event timestamp, and disclosure/template versions. They must not include OTPs, hashes, or full evidence documents.

## Data Model

### `messaging_programs`

- `id`, `organization_id`, `name`, `sender_display_name`.
- `message_class`, `purpose`, `status`.
- `help_contact`, `terms_url`, `privacy_url`.
- `current_disclosure_version_id`, `current_template_version_id`.
- `created_by_user_id`, approval metadata, timestamps.

### `consent_disclosure_versions`

- Immutable disclosure text and content hash.
- Program, locale, version, effective dates.
- Required fields and counsel/carrier approval metadata.

### `verification_template_versions`

- Immutable rendered template pattern and content hash.
- Locked required components and approved client variables.
- Locale, approval status, created/approved metadata.

### `recipient_authorizations`

- `id`, `organization_id`, `program_id`.
- Normalized encrypted phone value plus deterministic lookup hash and redacted display value.
- `client_recipient_reference`.
- Current status and current consent scope.
- Acquisition source/method, recipient-initiated attestation, evidence reference.
- Disclosure/template versions and content hashes.
- Requested, verified, revoked, reverification, and last-message timestamps.
- No hard deletion while evidence or suppression retention is required.

Unique active-state lookup should support `(organization_id, program_id, phone_hash)`.

### `recipient_authorization_events`

- Append-only event history.
- Previous/new state, reason code, actor type/ID.
- Gateway, inbound message, outbound message, API client, and request correlation IDs when applicable.
- Disclosure/template version and evidence metadata snapshot.
- Timestamp and tamper-evident integrity strategy.

### `verification_challenges`

- Authorization ID, OTP hash, expiry, attempts, resend count, status.
- Gateway/message IDs used for challenge delivery.
- Never store plaintext codes.
- Short operational retention after expiry; preserve the non-secret event evidence separately.

### Suppression changes

Extend or replace `opt_outs` to represent:

- program-scoped revocation;
- client-wide suppression;
- platform-wide failsafe suppression;
- source and interpreted keyword/reason;
- inbound gateway and matched outbound message;
- ambiguity candidates and review status;
- created, effective, revoked/re-consented, and updated timestamps.

Suppression records must survive client/application deletion as policy-controlled tombstones. The phone lookup value should be protected while remaining enforceable.

## STOP and Failsafe Integration

1. Parse case-insensitive standard commands including STOP, QUIT, END, REVOKE, OPT OUT, CANCEL, UNSUBSCRIBE, and STOP ALL.
2. Detect other unambiguous natural-language revocations through deterministic phrase rules and send uncertain cases to immediate suppression plus review. Do not put an AI classifier in the enforcement-critical path.
3. Match inbound replies against the most recent eligible outbound on the receiving gateway and recipient across all organizations, not the gateway owner's organization.
4. A reliable match creates client/program suppression and client-wide suppression when the request indicates all messages from that sender.
5. An ambiguous or unmatched STOP creates a platform-wide safety suppression and an operator alert.
6. Cancel queued/retry messages in the affected scope transactionally.
7. Re-check suppression and authorization during gateway claim and immediately before attempt start to close race windows.
8. Send at most one non-promotional confirmation, preferably within five minutes, from the receiving gateway when operationally possible.
9. Store the gateway as evidence, never as the suppression boundary.
10. Require explicit new consent/START to reactivate; never auto-expire STOP.

## Security and Abuse Controls

- Require organization-scoped API authorization on every endpoint.
- Restrict program/template approval to `org_admin` submission and `platform_admin` approval until policy automation is mature.
- Rate limit by organization, API client, recipient hash, source risk signal, program, and time window.
- Apply OTP expiry, attempt limits, resend cooldown, and replay prevention.
- Do not expose recipient existence through different public errors.
- Never return verification codes in callbacks, APIs, dashboards, logs, or message search.
- Redact phone numbers in ordinary UI/logs; tightly restrict access to full values.
- Sign callbacks and require replay protection using timestamp plus event ID.
- Reject client-supplied callback URLs that violate existing outbound-request policy; add SSRF controls if arbitrary endpoints remain supported.
- Record every authorization, verification, revocation, override attempt, template change, and enforcement decision.
- Remove `allowOptOutOverride` from client-controlled metadata.
- Keep any emergency exception in a separate endpoint/service with policy checks, immutable reason, actor, approval, and audit trail.

## Privacy, Retention, and Reassignment

Recommended policy pending counsel approval:

- Retain consent and revocation evidence for at least the applicable limitation and dispute period; use five years after the last relevant message or revocation as a proposed baseline, not a final legal conclusion.
- Retain suppressions until explicit re-consent or a documented number-reassignment process permits change.
- Minimize evidence content and avoid copying unnecessary client PII.
- Encrypt phone numbers at rest and keep a keyed deterministic lookup hash for enforcement.
- Define data-subject access/deletion handling that preserves legally necessary suppression tombstones.
- Add an FCC Reassigned Numbers Database integration before material scale. A reassignment signal changes the authorization to `reverification_required`; it must never transfer the former subscriber's consent to the new subscriber.

## Dashboard and Operator Experience

Add a `Recipient Authorization` area with:

- filters by client, program, status, source, and date;
- redacted recipient search using controlled exact lookup;
- authorization detail with disclosure/template versions and append-only timeline;
- resend challenge subject to rate limits;
- manual revoke/suppress action;
- no ordinary manual “mark verified” action;
- ambiguity-review queue for unmatched STOP messages;
- template/program approval workflow;
- export suitable for counsel/compliance review;
- alerts for challenge abuse, opt-out enforcement failures, and attempted suppressed sends.

## Migration and Rollout

### Phase 0 — Policy approval and feature flag

- Counsel approves message classes, disclosures, template requirements, retention, exception policy, jurisdiction matrix, and legacy-recipient treatment.
- Add `RECIPIENT_AUTHORIZATION_ENFORCEMENT=off|shadow|required`.
- Define production metrics and rollback behavior.

### Phase 1 — Schema and service foundation

- Add messaging program, versioned disclosure/template, authorization, challenge, event, and expanded suppression schemas.
- Add pure authorization/suppression services and indexes.
- Migrate existing active `opt_outs` into client-wide suppression records without weakening them.
- Preserve forward-fix migration and backup/restore procedures.

### Phase 2 — Authorization API and callbacks

- Implement program and recipient-authorization endpoints.
- Implement approved rendering, challenge delivery, confirmation, callback events, idempotency, and abuse controls.
- Keep enforcement in `shadow` mode while measuring how many current sends lack authorization.

### Phase 3 — STOP failsafe hardening

- Correct cross-organization inbound attribution on shared gateways.
- Add complete keyword/natural-language handling.
- Add ambiguous global suppression, queued-message cancellation, claim-time checks, confirmation, START/re-consent, and operator review.
- Remove metadata overrides.

### Phase 4 — Required enforcement

- Require `programId` and authorization for ordinary API/dashboard messages.
- Reject unauthorized sends before queue insertion.
- Re-check at claim/attempt time.
- Exempt only explicitly classified system/security workflows approved in Phase 0.

### Phase 5 — Client and operator UX

- Add program/template setup, hosted consent flow, authorization records, exports, and ambiguity queue.
- Add documentation, sample integrations, and client migration tooling.

### Phase 6 — Reassignment and compliance operations

- Integrate reassigned-number checks.
- Add scheduled reverification/risk policies.
- Run retention, export, incident, and counsel audit drills.

## Testing Strategy

### Unit

- State transitions and prohibited transitions.
- Template rendering cannot omit locked language.
- Phone normalization/hashing and tenant isolation.
- OTP hashing, expiry, retries, cooldown, replay prevention.
- Consent scope matching by organization/program/class.
- STOP phrase recognition, including punctuation/case and reasonable phrases.
- No metadata override path.

### Integration

- Recipient-initiated enrollment through successful verification and signed callback.
- Incorrect/expired OTP remains blocked.
- Ordinary message before verification returns the documented error.
- Authorized message is accepted, then blocked if STOP arrives before claim.
- STOP cancels queued/retry messages transactionally.
- Shared gateway correctly attributes STOP to the actual outbound client.
- Ambiguous STOP creates platform suppression and no client can send.
- START restores only the approved client/program scope.
- Cross-tenant authorization IDs and phone lookups are inaccessible.
- Callback retries are idempotent and signatures reject replay.

### Abuse and security

- Challenge bombing and enumeration attempts are throttled.
- A compromised API client cannot mark a recipient verified.
- Arbitrary template content cannot bypass locked disclosures.
- OTPs do not appear in logs, callbacks, API responses, or dashboard message bodies.
- Race test: STOP between queue, claim, and attempt prevents modem send.
- SSRF and callback destination controls.

### Manual/hardware

- Verification and STOP/START using real SIM gateways.
- Gateway rotation after authorization does not change consent scope.
- Shared-number ambiguity produces the expected global failsafe.
- Confirmation message is the only post-STOP message and contains no marketing.
- Hosted consent flow is keyboard accessible and readable on mobile.

## Observability and Release Gates

Metrics:

- authorization challenge requests, sends, completion rate, expiry, and abuse blocks;
- ordinary messages blocked by authorization state;
- messages blocked by client and platform suppression;
- STOP processing latency and queued-message cancellation count;
- ambiguous inbound STOP count and review age;
- claim/attempt-time enforcement blocks;
- callback failure/retry rate;
- verification gateway delivery failures;
- authorization evidence completeness.

Release blockers:

- Any ordinary send can bypass required authorization.
- Any active suppression can be bypassed through client metadata.
- STOP is not enforced before modem submission.
- Shared-gateway STOP can be silently assigned to the wrong client.
- Verification messages can contain arbitrary client marketing copy.
- OTP or full phone data leaks through logs, callbacks, or UI.
- Counsel has not approved production disclosures, exceptions, retention, and legacy migration.

## Acceptance Criteria

1. A new recipient cannot receive ordinary client messages until a permitted verification challenge completes and authorization is active.
2. Verification evidence records client, program, purpose, disclosure/template versions, source, affirmative action, timestamps, and number-control result.
3. Client customization cannot remove or change locked compliance content.
4. Authorization applies across all eligible gateways but only within the approved client/program scope.
5. STOP blocks the client across gateways immediately and cancels pending messages.
6. Ambiguous STOP blocks the number platform-wide until resolved.
7. Suppression is enforced at acceptance, claim, and attempt start.
8. A client API credential cannot override opt-out or self-verify a recipient.
9. START/re-consent creates a new auditable event and does not reactivate unrelated scopes.
10. Signed callbacks report authorization lifecycle without exposing secrets.
11. Existing opt-outs are preserved through migration.
12. Tests cover successful, failure, abuse, race, shared-gateway, and tenant-isolation paths.

## Blocking Human Decisions

Owner: DigiColony product owner with qualified telecom/privacy counsel.

1. Which message classes DigiColony will support at launch.
2. Final disclosure, verification, confirmation, HELP, STOP, and START language.
3. Whether imported legacy consent is allowed and how it is reverified.
4. Required retention by jurisdiction and client contract.
5. Emergency/exempt workflow, if any.
6. Whether dedicated/sticky sender numbers are mandatory per client/program.
7. State-law and non-US jurisdiction support at launch.
8. Reassigned Numbers Database launch phase and query cadence.

## Non-Blocking Product Defaults

- Use hosted double opt-in as the recommended integration.
- Use approved templates rather than arbitrary custom verification copy.
- Scope active authorization to client plus messaging program.
- Scope ordinary STOP client-wide across gateways unless the recipient clearly limits or broadens it.
- Use platform-wide suppression for ambiguity.
- Make enforcement immediate and fail closed.
- Keep AI out of the enforcement-critical path.

## Specialist Routing Decision

- Product research: skipped for this draft because primary regulator and industry sources establish the relevant baseline; carrier-specific contractual review remains a human/legal task.
- UX strategy: needed during Phase 5 for hosted consent, program approval, evidence review, and ambiguity workflows.
- UI design system: deferred until the Phase 5 workflow is approved.
- Interaction design: needed for the authorization state machine and operator ambiguity resolution before UI implementation.
- Design QA: required after the hosted flow and operator dashboard are implemented.

## Codex Handoff Read Order

Before implementation, read:

1. this plan;
2. `migrations/005_production_foundation.sql`;
3. `src/lib/inbound.ts`;
4. `src/lib/messages.ts`;
5. `src/app/api/messages/route.ts`;
6. `src/app/api/gateway/inbound/route.ts`;
7. `src/lib/callbacks.ts` and `src/lib/webhooks.ts`;
8. `docs/dpaf/20-production-expansion-plan.md`;
9. `docs/dpaf/21-production-operations-runbook.md`.

Do not begin required-mode enforcement until the blocking human decisions are recorded and Phase 0 is approved.
