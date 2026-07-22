# Recipient Authorization Integration Guide

Status: Implemented on `opt-in`
Date: 2026-07-21
Base URL: `https://sns.digicolony.net`

## Launch Workflow

1. An organization administrator creates a messaging program in **Recipient Consent**.
2. A platform administrator reviews and activates it. Client API keys can list only active programs.
3. The recipient starts authorization through the DigiColony-hosted form at `/consent/{programId}` or through the client's own form.
4. For a client form, the client posts the recipient's affirmative request to `POST /api/recipient-authorizations`.
5. DigiColony sends its locked verification text. The client posts the six-digit code the recipient supplies to the confirmation endpoint.
6. Ordinary messages can be submitted only after the authorization reaches `verified_authorized`.
7. A STOP reply revokes the client-wide authorization and immediately cancels ordinary queued work. An ambiguous STOP activates a platform-wide failsafe suppression.

Verification establishes control of the mobile number. It is deliberately coupled to a recorded affirmative disclosure acceptance so that the code alone is not treated as consent.

## Authentication

Client requests use an organization API key:

```http
Authorization: Bearer rhc_your_api_key
Content-Type: application/json
```

The API key's organization determines all program and authorization scope. An input value cannot select another organization.

## 1. List Approved Programs

```http
GET /api/messaging-programs
```

Choose the active program whose disclosed purpose matches the form and messages being sent.

## 2. Start Double Opt-In

Call this endpoint only after the recipient has viewed the approved disclosure and affirmatively requested the verification text.

```http
POST /api/recipient-authorizations

{
  "programId": "11111111-1111-4111-8111-111111111111",
  "phoneNumber": "+13213609348",
  "clientRecipientReference": "owner-4821",
  "consentSource": "client_form",
  "recipientInitiated": true,
  "evidenceReference": "signup-2026-07-21-owner-4821",
  "idempotencyKey": "owner-4821-sms-opt-in-v1",
  "callbackUrl": "https://client.example.com/webhooks/digicolony"
}
```

The response is `202 Accepted`. It contains the authorization ID, redacted phone, `challenge_pending` status, and challenge expiry. DigiColony never returns the OTP or its hash. Challenge requests have a 60-second cooldown, a five-per-hour limit per client and number, a ten-minute expiry, and a five-attempt limit.

## 3. Confirm the Recipient Code

```http
POST /api/recipient-authorizations/{authorizationId}/confirm

{
  "code": "123456"
}
```

A successful response changes the state to `verified_authorized`. Invalid, expired, or attempt-limited codes return `400`. A resend is available at:

```http
POST /api/recipient-authorizations/{authorizationId}/resend
```

## 4. Submit an Authorized Message

```http
POST /api/messages

{
  "to": "+13213609348",
  "body": "Your requested property update is ready.",
  "programId": "11111111-1111-4111-8111-111111111111",
  "recipientAuthorizationId": "22222222-2222-4222-8222-222222222222",
  "idempotencyKey": "owner-4821-update-17",
  "metadata": {
    "ownerReference": "owner-4821"
  }
}
```

`recipientAuthorizationId` is optional; when omitted, DigiColony selects the verified authorization for the program and number. The `programId` is always required. Authorization, active-program status, client suppression, and platform suppression are checked when the message is accepted, claimed by a gateway, and started by the device.

Common denials are `recipient_authorization_required`, `recipient_opted_out`, and `recipient_platform_suppressed`.

## Status and Revocation

```http
GET /api/recipient-authorizations/{authorizationId}
POST /api/recipient-authorizations/{authorizationId}/revoke
```

The GET response is organization-scoped and never includes the full phone number. The revoke endpoint immediately applies client-wide suppression for that number and cancels that client's ordinary queued, retrying, or claimed messages.

## Callback Events

Authorization callbacks use the same signed callback-delivery system as other DigiColony callbacks. Implementations must verify the signature and process callbacks idempotently.

- `recipient.authorization.challenge_sent`
- `recipient.authorization.verified`
- `recipient.authorization.expired`
- `recipient.authorization.revoked`

Payloads contain the authorization, organization, program, client recipient reference, redacted phone, status, and event time. They do not contain a verification code, hash, or full phone number.

## STOP, START, and HELP

- `STOP`, `STOP ALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`, `REVOKE`, and `OPT OUT` are recognized, along with a narrow set of clear natural-language stop requests.
- A uniquely attributable STOP suppresses all ordinary messages from that client across every program and gateway.
- If recent shared-number traffic makes the sender ambiguous, the platform suppresses the number globally as a failsafe.
- `START`, `UNSTOP`, or `SUBSCRIBE` can restore only the uniquely matched program. `YES` is intentionally not treated as reauthorization.
- The single confirmation response is pinned to the same gateway/number that received the inbound command.

## Operational Notes

- There is no existing-consent import endpoint at launch.
- Platform suppressions are not automatically cleared by START; they require reviewed administrative resolution.
- Maintenance expires stale challenges, emits expiry callbacks, and cancels queued ordinary messages whose authorization or program became invalid.
- Consent disclosure and verification templates are immutable, versioned, and content-hashed for evidence.
- Legal counsel must approve production disclosure text, program classification, record retention, and jurisdiction-specific requirements.
