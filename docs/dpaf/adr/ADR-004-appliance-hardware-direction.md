# ADR-004: Recommend Raspberry Pi-Class Linux Appliance For MVP

## Status
Proposed

## Context
The original SOW mentioned Raspberry Pi, but the user does not want to hard-limit the project to Raspberry Pi or Python. The user commonly uses Raspberry Pi or ESP32 custom hardware.

## Decision
Use Raspberry Pi Zero 2 W with the selected SIM7070G Pi HAT-class module for MVP. Preserve ESP32 custom hardware as a future option.

## Rationale
- Linux simplifies TLS, API clients, service supervision, logging, updates, local debugging, and SIM7070 modem integration.
- The MVP needs fast iteration and reliable diagnostics more than custom hardware optimization.
- ESP32 can be evaluated later after the central API and gateway protocol stabilize.

## Consequences
- MVP appliance may have higher unit cost and power use than ESP32.
- Gateway runtime is TypeScript/Node for MVP. Python remains a future fallback only if SIM7070 testing shows it is materially more stable.
- Hardware abstraction should keep the modem adapter separable from the gateway polling protocol.
