# Roadmap

Status: Draft.

## Candidate MVP
- Cloud API can insert outbound SMS messages.
- Cloud database stores messages, gateways, claims, attempts, health, and logs.
- Dashboard/operator UI shows queue, message status, gateway health, and logs.
- Gateway appliance can claim, send, and update carrier-submitted status through SIM7070.
- Multiple gateways can coordinate work with best-effort duplicate prevention.
- Retry and reconnect behavior is configurable.
- Timeout-based failover can reassign stuck messages.
- Mock modem/API/database paths support testing.

## Candidate Next Phase
- Qualify a production-eligible carrier/SIM and real-network delivery reports.
- Complete webhook operational hardening and publish machine-readable contracts.
- Implement the SwimSense alert-to-reply-to-app pilot against first-class conversations.
- Add conversation workflow state, deterministic reply commands, escalation policies, and segment/cost controls.
- Validate the same contract with two Stratus Tools workflows without forking the platform.

## Candidate Future Phase
- Store-and-forward edge durability and measured load/failure SLOs.
- Customer-dedicated gateway pools and workflow adapters/SDKs.
- More hardware/modem support.
- ESP32 custom appliance evaluation.
