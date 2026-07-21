# Design Principles

Status: Draft after first discovery interview.

## Principles
1. Prefer clear, observable dispatch state over pretending SMS can be made perfectly exactly-once.
2. Design gateways as independently recoverable workers.
3. Keep provider, APN, API, modem, and deployment configuration externalized.
4. Treat the central dashboard, health, and logs as first-class operational surfaces.
5. Keep the appliance stack portable until hardware/runtime selection is justified.
6. Separate MVP failover from future load-balancing optimization.
