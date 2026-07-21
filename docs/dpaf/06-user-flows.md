# User Flows

Status: Draft.

## Candidate Operational Flows
- Operator inserts an outbound SMS through the API or dashboard.
- Operator monitors message queue and delivery status.
- Operator monitors gateway fleet health.
- Configure a gateway.
- Register or identify a gateway.
- Claim a pending SMS message.
- Send an SMS through SIM7070.
- Record carrier-submitted status and timestamp.
- Retry failed delivery.
- Fail over stuck claimed work to another gateway after timeout.
- Inspect logs for troubleshooting.

## Primary MVP Flow
1. Admin creates an outbound message from dashboard.
2. Message enters `queued`.
3. Gateway heartbeats and requests a claim.
4. Central API atomically leases one eligible message to the gateway.
5. Gateway sends through SIM7070.
6. Gateway reports carrier-submitted status.
7. Dashboard reflects message completion and gateway activity.

## Failover Flow
1. Gateway claims a message.
2. Gateway fails to complete before `claim_expires_at`.
3. Central API makes the message eligible for claim again.
4. Another healthy gateway claims and attempts the message.

## Retry Flow
1. Gateway reports send failure.
2. Central API increments attempt count.
3. If attempts remain, message moves to `retry_scheduled`.
4. If attempts are exhausted, message moves to `dead_lettered`.
