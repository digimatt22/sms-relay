# RelayHub SMS Webhook Integration Guide

RelayHub can call a client callback URL for inbound replies and future outbound status events.

## Request Format

RelayHub sends JSON over `POST`:

```json
{
  "event": "sms.inbound.received",
  "inboundMessageId": "uuid",
  "matchedOutboundMessageId": "uuid-or-null",
  "gatewayId": "uuid",
  "from": "+13215551212",
  "fromRedacted": "***-***-1212",
  "body": "YES",
  "receivedAt": "2026-07-11T14:20:00.000Z",
  "metadata": {}
}
```

## Events

Current production event:
- `sms.inbound.received`

Planned compatible events:
- `sms.outbound.carrier_submitted`
- `sms.outbound.failed`
- `sms.opt_out.recorded`
- `sms.command.received`

## Signatures

Set `RELAYHUB_WEBHOOK_SECRET` in the hub environment to enable signed callbacks.

Signed requests include:
- `x-relayhub-timestamp`
- `x-relayhub-signature`

The signature header is:

```text
sha256=<hex-hmac>
```

The HMAC input is:

```text
{timestamp}.{rawJsonBody}
```

Use HMAC-SHA256 with the shared webhook secret. Reject requests with stale timestamps, missing headers, or invalid signatures.

## Retries

RelayHub stores callback attempts in `callback_deliveries`.

Retry behavior:
- pending and failed deliveries are processed by `/api/callback-deliveries/process`
- each failed attempt increments `attempt_count`
- retry delay backs off up to one hour
- operators can retry individual deliveries from `/callbacks`

## Response Expectations

Return any `2xx` HTTP status to mark the callback delivered.

Non-2xx responses and network errors are stored with:
- HTTP status
- response body excerpt
- retry count
- next attempt time

## Idempotency

Webhook consumers should treat `inboundMessageId` as the idempotency key for inbound events. RelayHub may retry the same delivery after transient failures.
