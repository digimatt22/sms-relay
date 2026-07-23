# DigiColony SNS Webhook Integration Guide

## Scope and ownership

Webhook subscriptions belong to an individual API key, not merely to a client/application. Events created with one key are never delivered to a different key's subscription. This permits SwimSense, Stratus Tools, staging, and production integrations to use separate credentials and endpoints without cross-delivery.

Use the client API key as a bearer token:

```http
Authorization: Bearer rhc_...
```

## Manage subscriptions

### Create or update

```http
POST /api/webhook-subscriptions
Content-Type: application/json

{
  "callbackUrl": "https://api.example.com/webhooks/digicolony",
  "description": "Production synchronization",
  "eventTypes": [
    "sms.inbound.received",
    "sms.outbound.delivery_confirmed",
    "sms.outbound.delivery_failed"
  ]
}
```

Use `"*"` to receive every event. The response includes the subscription and its derived `signingSecret`. Store the secret in a secret manager. Re-posting the same callback URL for the same key updates its event selection.

### List or disable

- `GET /api/webhook-subscriptions` lists only the current key's subscriptions.
- `DELETE /api/webhook-subscriptions/{id}` disables only a subscription owned by the current key.

## Versioned envelope

Every subscription delivery uses the same top-level contract:

```json
{
  "id": "fc2dfe14-9055-4c52-bbcc-218097b26c30",
  "type": "sms.inbound.received",
  "schemaVersion": "2026-07-22",
  "occurredAt": "2026-07-22T20:17:04.000Z",
  "organizationId": "7c7f8c95-0f13-472d-a665-e174ee3e28ef",
  "apiClientId": "431b7836-99df-4ca3-824c-12cc5b34e10c",
  "apiClientKeyId": "ba70e4c1-4886-44fa-b0f9-f795d2c53fd2",
  "messageId": "68207d04-4cc6-4632-8457-c6d25d8820cd",
  "conversationId": "880a85ec-f15e-4db4-83e7-e2f1acfa436f",
  "inboundMessageId": "7c229130-53fc-4d02-bddd-fc3df0372b83",
  "recipientAuthorizationId": null,
  "data": {
    "conversation": {
      "id": "880a85ec-f15e-4db4-83e7-e2f1acfa436f",
      "participant": "+13215551212",
      "participantRedacted": "***-***-1212",
      "externalReference": "swimsense-alert-4821",
      "status": "open",
      "metadata": {},
      "lastMessageAt": "2026-07-22T20:17:04.000Z"
    },
    "inboundMessage": {
      "id": "7c229130-53fc-4d02-bddd-fc3df0372b83",
      "conversationId": "880a85ec-f15e-4db4-83e7-e2f1acfa436f",
      "matchedOutboundMessageId": "68207d04-4cc6-4632-8457-c6d25d8820cd",
      "gatewayId": "126d6be7-5743-4626-bb15-bd54e3d5e1e3",
      "from": "+13215551212",
      "fromRedacted": "***-***-1212",
      "body": "I can visit Friday at 2",
      "receivedAt": "2026-07-22T20:17:04.000Z",
      "metadata": {}
    }
  }
}
```

Context is included as applicable:

- `data.message` contains the outbound body, recipient, status, priority, metadata, and lifecycle timestamps.
- `data.inboundMessage` contains the reply body, sender, gateway, match, and receive time.
- `data.conversation` contains the external reference and thread metadata used to correlate the event without another API call.
- `data.recipientAuthorization` contains redacted authorization state and timestamps.
- Event-specific transition details may also appear in `data`.

Consumers must ignore unknown fields. A breaking change requires a new `schemaVersion`; additive fields do not.

## Event catalog

Outbound lifecycle:

- `sms.outbound.queued`
- `sms.outbound.claimed`
- `sms.outbound.sending`
- `sms.outbound.carrier_submitted`
- `sms.outbound.delivery_pending`
- `sms.outbound.delivery_confirmed`
- `sms.outbound.delivery_failed`
- `sms.outbound.delivery_unknown`
- `sms.outbound.retry_scheduled`
- `sms.outbound.dead_lettered`
- `sms.outbound.canceled`
- `sms.outbound.requeued`

Inbound and conversations:

- `sms.inbound.received`
- `conversation.created`
- `conversation.closed`

Authorization and opt-out:

- `recipient.authorization.challenge_sent`
- `recipient.authorization.verified`
- `recipient.authorization.expired`
- `recipient.authorization.revoked`
- `recipient.authorization.reconsented`
- `recipient.opt_out.recorded`

`carrier_submitted` means the modem/carrier accepted the SMS. It does not mean the handset received it. Treat `delivery_confirmed` as the positive handset-delivery state. Some networks do not return a conclusive report; those messages eventually become `delivery_unknown`.

## Authentication

Each request includes:

- `x-relayhub-timestamp`: Unix time in seconds
- `x-relayhub-signature`: `sha256=<hex-hmac>`
- `x-relayhub-delivery`: callback-delivery identifier

The signed byte string is:

```text
{timestamp}.{rawJsonBody}
```

Compute HMAC-SHA256 using the subscription's `signingSecret`, compare signatures with a constant-time comparison, and reject timestamps outside a five-minute window. Verify the raw request bytes before parsing JSON.

## Delivery, retries, and idempotency

Return any `2xx` response promptly. Network errors and non-2xx responses are persisted in `callback_deliveries` and retried with backoff up to one hour. Webhook processing must be idempotent: use the envelope `id` as the event idempotency key, enqueue internal work, and return before doing slow downstream processing. Delivery order is usually chronological but is not guaranteed across retries.

Legacy per-message `callbackUrl` remains available for transition purposes. New integrations should use API-key subscriptions because they cover the complete lifecycle and provide one consistent event contract.
