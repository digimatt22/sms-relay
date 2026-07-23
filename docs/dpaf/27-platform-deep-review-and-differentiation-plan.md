# Platform Deep Review and Differentiation Plan

Status: Goal and phased plan established 2026-07-22.

## Product position

DigiColony SNS should not try to be a smaller Twilio. Twilio is a broad global communications platform with carrier abstraction, high throughput, mature SDKs, and many channels. This system is strongest as a private, workflow-native messaging control plane: client software owns the business workflow while DigiColony owns durable conversations, consent, a managed edge fleet, delivery evidence, and integration events.

The primary design partner is SwimSense LLC. Stratus Tools is the second rollout target. The shared product thesis is:

> Turn a machine or business-system condition into a traceable human conversation, then turn the reply back into structured workflow state without requiring the recipient to install, log in to, or learn another application.

## Differentiators already present

1. **Workflow-native threads.** An external alert/work-item reference survives outbound messages, replies, delivery events, and webhook retries.
2. **Exact-key isolation.** Separate SwimSense, Stratus, staging, production, and partner keys can have independent threads and event destinations within one client account.
3. **Owned edge fleet.** Routing, health, diagnostics, software version, SIM/modem identity, gateway pools, rate caps, and commands are first-class platform data.
4. **Transport evidence.** Carrier submission and handset delivery are distinct, with raw receipt evidence and normalized events.
5. **Consent in the control plane.** Messaging programs, recipient authorization, STOP/START, platform suppression, and audit history are integrated with dispatch.
6. **Predictable integration contract.** Append-only versioned events and durable signed retries make client synchronization a platform capability, not custom callback code per workflow.
7. **White-label and tenant-aware operation.** Organizations, roles, API applications, gateway pools, and branding support several products without collapsing their data boundaries.

## Best-fit use cases

### SwimSense

- Pool chemistry/equipment alert → owner or service professional → reply with acknowledgement or ETA → reply appears in the SwimSense mobile/web timeline.
- Maintenance reminder → recipient replies `DONE`, `FRIDAY 2PM`, or free text → SwimSense updates or flags the work item.
- Escalation when an alert is delivered but not acknowledged within an SLA.
- Service-company dispatch where the professional needs only SMS, while the pool owner sees the resulting status inside SwimSense.

### Stratus Tools

- Tool checkout/overdue notices with `RETURNING 3PM` replies.
- Low inventory or jobsite replenishment requests with acknowledgement and ETA.
- Maintenance/calibration alerts tied to a tool or work order.
- Jobsite exception/escalation workflows for people who will not regularly open the Stratus application.

### Later clients

- Property and facility maintenance.
- Environmental, agricultural, refrigeration, and remote equipment monitoring.
- Field-service scheduling and exception handling.
- Small operational teams where installing another mobile app is the main adoption barrier.

Poor fits are global messaging coverage, large promotional campaigns, very high burst throughput, rich media, and organizations that want the carrier/compliance operations entirely outsourced. Twilio or another registered CPaaS remains stronger for those cases; it is not configured as a fallback here.

## Deep technical review

### Strong foundation

- Tenant and role boundaries are explicit.
- Gateway claim leases, retry/dead-letter behavior, routing pools, health, and alerting are materially beyond a prototype.
- Recipient authorization and opt-out controls are unusually complete for an owned-gateway system.
- The new event and conversation model provides the right integration seam for both design partners.

### Release blockers (P0)

1. **Commercial carrier authorization.** The current Tello configuration is suitable only for lab testing. Tello's terms describe plans as residential/non-commercial and voice/text as direct communication between individuals. Obtain an eligible business/A2P or IoT messaging agreement and document throughput, automated-use permission, sender registration, delivery-report behavior, and opt-out obligations before production rollout.
2. **Real-network receipt qualification.** Test `+CDS` on each production SIM/carrier/modem firmware. Add `+CDSI` stored-report retrieval if the carrier/modem does not emit direct reports. Record a device/carrier capability matrix and verify delayed, duplicate, pending, failed, and reference-wrap behavior.
3. **Migration and rollback rehearsal.** Apply migration 019 in a disposable copy of production data, validate constraints/indexes, test rollback/restore, then deploy hub before gateway software.
4. **Webhook operations.** Run the callback processor as a supervised recurring worker; add endpoint verification/test delivery, per-subscription secret rotation, a dead-letter/replay view, lag/rate alerts, and DNS-resolution controls to prevent rebinding to private addresses.
5. **Contract test kit.** Publish an OpenAPI document, JSON Schema for each schema version, example verifier, replay fixtures, and consumer contract tests for SwimSense and Stratus.
6. **Privacy and retention.** Set message/event body retention by client, encrypt sensitive content at rest, limit callback payload access, audit reads, and avoid duplicating bodies indefinitely in both messages and platform events.
7. **Load and failure qualification.** Measure per-modem throughput, burst behavior, restart recovery, local-network outage behavior, database contention, webhook backlog recovery, and duplicate probability under lease expiry.

### Next differentiating capabilities (P1)

1. **Conversation workflow state:** type, severity, assignment, acknowledgement, due/SLA time, resolution, and linked business object.
2. **Reply interpretation:** deterministic command/keyword rules first (`ACK`, `DONE`, `ETA ...`), followed by optional confidence-scored extraction with human review; always preserve original text.
3. **Escalation policies:** delivery-aware timers, quiet hours, ordered contacts, acknowledgement deadlines, and escalation cancellation when a reply resolves the alert.
4. **Client adapters:** a SwimSense alert adapter and Stratus work-order/tool adapter that map native IDs and state transitions to the generic conversation/event contract.
5. **Segment and cost controls:** GSM/UCS-2 segment estimator before send, template length warnings, monthly per-key/gateway cost allocation, anomalous retry detection, and client budgets.
6. **Store-and-forward edge durability:** persist inbound receipts/replies and outbound attempt results locally until the hub acknowledges them; expose backlog and oldest-item age.
7. **Operational conversation UI:** searchable threads, assignment, unread/awaiting-response filters, annotations, retry history, and a direct link back to the client record.

### Strategic options (P2)

- Rules that execute close to the monitored equipment during cloud outages.
- Customer-managed gateways or dedicated regional gateway pools with residency controls.
- SDKs and low-code connectors for common field-service/work-order systems.
- Push/email/RCS as explicit workflow channels where useful, not silent AWS/Twilio SMS fallbacks.
- Aggregate delivery and response intelligence by carrier, gateway, alert type, and time of day.

## Product-development goal

Prove that a SwimSense alert can complete an end-to-end, auditable loop—condition detected, compliant SMS sent, handset outcome observed where supported, reply correlated, SwimSense state updated, and escalation closed—then generalize the same contract for a Stratus work item without client-specific gateway code.

### Phase 1: production proof (SwimSense)

- Resolve every P0 item.
- Build one SwimSense adapter against a sandbox.
- Pilot with internal/test recipients and a production-eligible carrier agreement.
- Success: 99%+ correctly correlated replies, no cross-key deliveries, measured delivery-state coverage, webhook recovery after induced outage, and a documented cost per completed alert conversation.

### Phase 2: repeatability proof (Stratus)

- Map two Stratus workflows without changing the core event schema.
- Add structured reply commands and escalation policy.
- Success: onboarding is configuration/adapter work, not a platform fork.

### Phase 3: productization

- Self-service key/subscription management, templates, contract SDKs, cost allocation, retention controls, fleet SLOs, and a carrier-qualified appliance package.
- Establish commercial pricing only after measuring support effort, carrier cost, cloud cost, gateway replacement rate, and safe capacity.

## Decision metrics

- Cost per outbound segment and per completed conversation.
- Handset-delivery report coverage by carrier/gateway.
- Reply correlation accuracy and ambiguity rate.
- Median time to acknowledgement/resolution.
- Webhook success, lag, retry, and replay rates.
- Gateway availability, backlog age, and messages per minute.
- Opt-out, complaint, and invalid-number rates.
- Client onboarding time and client-specific code required.
