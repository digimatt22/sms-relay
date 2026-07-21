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
- Production deployment hardening and operational runbooks.
- Stronger duplicate prevention and operational alerting.
- Finalize appliance hardware if MVP used dev hardware.
- Implement all Phase 3-7 kickoff prompts after repository conventions are proven.

## Candidate Future Phase
- Load balancing across gateways.
- Expanded API/database compatibility.
- More hardware/modem support.
- ESP32 custom appliance evaluation.
