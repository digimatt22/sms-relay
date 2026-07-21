# Product Vision

Status: Draft after first discovery interview.

## Current Vision
Provide a cloud-coordinated outbound SMS gateway platform where remote appliances send messages through SIM7070 modules, report health/logs/status to a central hub, and give operators a dashboard for queue and fleet visibility.

## MVP Boundary
- Outbound SMS only.
- Cloud-hosted central API, database, logs/health collection, and operator dashboard.
- Remote gateway appliance service that claims work from the central API.
- Best-effort duplicate prevention.
- Carrier-submitted status as MVP success.
- Timeout-based failover for stuck claimed messages.

## Future Direction
- Future load balancing.
- Compatibility with different API and database structures.
- Potential non-Raspberry-Pi appliance targets.
- Potential Python gateway runtime only if a future modem integration requires it.
