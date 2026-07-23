import { requireAdminPage } from "@/lib/page-auth";
import { getPlatformName } from "@/lib/branding";

const baseUrl = "https://sns.digicolony.net";

const clientEndpoints = [
  ["GET", "/api/messaging-programs", "Client API key or admin session", "List approved messaging programs."],
  ["POST", "/api/recipient-authorizations", "Client API key or admin session", "Start a recipient-requested double opt-in."],
  ["GET", "/api/recipient-authorizations/{authorizationId}", "Client API key or admin session", "Read redacted authorization status."],
  ["POST", "/api/recipient-authorizations/{authorizationId}/confirm", "Client API key or admin session", "Verify the recipient-supplied six-digit code."],
  ["POST", "/api/recipient-authorizations/{authorizationId}/resend", "Client API key or admin session", "Resend after the cooldown, subject to limits."],
  ["POST", "/api/recipient-authorizations/{authorizationId}/revoke", "Client API key or admin session", "Revoke and suppress ordinary messages for the client."],
  ["GET / POST", "/api/webhook-subscriptions", "Client API key", "List or create subscriptions owned by this exact API key."],
  ["DELETE", "/api/webhook-subscriptions/{subscriptionId}", "Client API key", "Disable a subscription owned by this exact API key."],
  ["GET / POST", "/api/conversations", "Client API key", "List or open first-class conversation threads for this key."],
  ["GET / DELETE", "/api/conversations/{conversationId}", "Client API key", "Read the timeline or close a thread owned by this key."],
  ["POST", "/api/conversations/{conversationId}/messages", "Client API key", "Send in an existing conversation."],
  ["POST", "/api/messages", "Client API key or admin session", "Queue an authorized outbound SMS message."],
  ["GET", "/api/messages/{messageId}", "Client API key or admin session", "Read one outbound message with attempts."],
  ["POST", "/api/messages/{messageId}/cancel", "Client API key or admin session", "Cancel a queued, retry-scheduled, or claimed message."],
  ["POST", "/api/messages/{messageId}/requeue", "Client API key or admin session", "Return a non-submitted message to the queue for retry."]
];

const adminEndpoints = [
  ["POST", "/api/messaging-programs", "Client admin session", "Create a messaging program and submit it for platform approval."],
  ["GET", "/api/messages?status=queued", "Admin session", "List recent outbound messages, optionally filtered by status."],
  ["GET", "/api/gateways", "Admin session", "List gateways for the active client context."],
  ["POST", "/api/gateways", "Admin session", "Create a gateway and return its one-time gateway key."],
  ["GET", "/api/gateways/{gatewayId}", "Admin session", "Read gateway profile, recent attempts, and health samples."],
  ["PATCH", "/api/gateways/{gatewayId}", "Operator session", "Update gateway name, notes, carrier, limits, and routing weight."],
  ["GET", "/api/gateways/{gatewayId}/logs", "Admin session", "Read recent gateway logs."],
  ["POST", "/api/gateways/{gatewayId}/enable", "Operator session", "Enable a disabled gateway."],
  ["POST", "/api/gateways/{gatewayId}/disable", "Operator session", "Disable a gateway."],
  ["POST", "/api/gateways/{gatewayId}/maintenance", "Operator session", "Put a gateway into maintenance."],
  ["POST", "/api/gateways/{gatewayId}/rotate-key", "Client admin session", "Rotate the gateway API key."],
  ["PATCH", "/api/clients/{apiClientId}", "Client admin session", "Update hourly and daily limits for an API app."],
  ["POST", "/api/clients/{apiClientId}/enable", "Client admin session", "Enable an API app."],
  ["POST", "/api/clients/{apiClientId}/disable", "Client admin session", "Disable an API app and revoke keys."],
  ["POST", "/api/clients/{apiClientId}/rotate-key", "Client admin session", "Rotate the API app key."],
  ["POST", "/api/maintenance/run", "Admin session", "Run retention and usage rollup jobs."],
  ["POST", "/api/alerts/process", "Admin session", "Generate operational alerts."],
  ["POST", "/api/alerts/{alertId}/resolve", "Admin session", "Resolve an alert."],
  ["POST", "/api/callback-deliveries/process", "Admin session", "Retry pending callback deliveries."],
  ["POST", "/api/callback-deliveries/{deliveryId}/retry", "Admin session", "Retry one callback delivery."]
];

const gatewayEndpoints = [
  ["POST", "/api/gateway/heartbeat", "Gateway API key", "Report gateway status, modem details, and health metrics."],
  ["POST", "/api/gateway/logs", "Gateway API key", "Upload structured appliance logs."],
  ["POST", "/api/gateway/messages/claim", "Gateway API key", "Claim the next eligible outbound message."],
  ["POST", "/api/gateway/messages/{messageId}/attempts/start", "Gateway API key", "Start an SMS send attempt for a claimed message."],
  ["POST", "/api/gateway/messages/{messageId}/attempts/{attemptId}/submitted", "Gateway API key", "Mark a message as carrier-submitted."],
  ["POST", "/api/gateway/messages/{messageId}/attempts/{attemptId}/failed", "Gateway API key", "Report a send failure and schedule retry/dead-letter handling."],
  ["POST", "/api/gateway/inbound", "Gateway API key", "Upload received SMS messages and trigger reply callbacks."],
  ["POST", "/api/gateway/delivery-reports", "Gateway API key", "Upload modem delivery reports and normalize final handset delivery state."],
  ["POST", "/api/gateway/commands/claim", "Gateway API key", "Claim queued commands such as diagnostics or modem reset."],
  ["POST", "/api/gateway/commands/{commandId}/complete", "Gateway API key", "Report command completion or failure."]
];

const statuses = [
  ["queued", "Accepted by the platform and waiting for an eligible gateway."],
  ["claimed", "Reserved by one gateway for a short claim window."],
  ["sending", "Gateway started a modem send attempt."],
  ["retry_scheduled", "Send failed and will be retried after backoff."],
  ["carrier_submitted", "The modem accepted the message and returned a carrier message reference; handset delivery is not yet known."],
  ["delivery_confirmed", "The carrier reported successful delivery to the handset."],
  ["delivery_failed", "The carrier reported that handset delivery failed."],
  ["delivery_unknown", "No conclusive delivery report arrived within the platform window."],
  ["dead_lettered", "Retries are exhausted and operator review is required."],
  ["canceled", "Canceled before carrier submission."]
];

export default async function ApiDocsPage() {
  await requireAdminPage();
  const platformName = getPlatformName();

  return (
    <>
      <header className="page-header">
        <div>
          <p className="muted">Developer documentation</p>
          <h1>{platformName} API</h1>
          <p>Everything needed to send SMS, track status, receive replies, and integrate client applications with {platformName}.</p>
        </div>
      </header>

      <div className="route-card-grid">
        <section className="panel">
          <h2>Start Here</h2>
          <ol>
            <li>Create a client in <strong>Clients</strong>.</li>
            <li>Create an API key under <strong>API Keys</strong>.</li>
            <li>Name the key for where it is used, such as Production CRM or Staging.</li>
            <li>Create and obtain approval for a messaging program in <strong>Recipient Consent</strong>.</li>
            <li>Send requests with <code>Authorization: Bearer rhc_...</code>.</li>
            <li>Authorize the recipient before sending an ordinary message.</li>
            <li>Use an <code>idempotencyKey</code> for every logical message.</li>
          </ol>
          <CodeBlock>{`curl -X POST ${baseUrl}/api/messages \\
  -H "Authorization: Bearer rhc_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+13213609348",
    "body": "Hello from ${platformName}",
    "programId": "11111111-1111-4111-8111-111111111111",
    "idempotencyKey": "order-123-confirmation",
    "metadata": {
      "customerRef": "order-123"
    },
    "callbackUrl": "https://example.com/webhooks/relayhub"
  }'`}</CodeBlock>
        </section>

        <aside className="panel">
          <h2>Core Rules</h2>
          <div className="object-list">
            <DocFact label="Base URL" value={baseUrl} />
            <DocFact label="Auth" value="Bearer API key" />
            <DocFact label="Content type" value="application/json" />
            <DocFact label="Phone format" value="E.164 preferred; common US formats accepted" />
            <DocFact label="Submission" value="carrier_submitted" />
            <DocFact label="Handset delivery" value="delivery_confirmed, when the carrier provides a report" />
            <DocFact label="Consent" value="Required for ordinary messages" />
            <DocFact label="Webhooks" value="Subscriptions are isolated to the exact API key" />
          </div>
        </aside>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>SwimSense Pool Monitoring Setup</h2>
        <p className="muted">Create one messaging program for the SwimSense alert service. Do not create a new program for every pool owner.</p>
        <h3>Dashboard setup (client administrator)</h3>
        <ol>
          <li>Open <strong>Recipient Consent</strong> and create <strong>SwimSense Pool Alerts</strong>.</li>
          <li>Use sender name <strong>SwimSense Pool Monitoring</strong>, class <strong>Informational recurring</strong>, and purpose <strong>Pool condition alerts, equipment warnings, and maintenance notifications</strong>.</li>
          <li>Set the frequency to <strong>Message frequency varies based on pool conditions</strong>, then add SwimSense support, terms, privacy, and callback URLs.</li>
          <li>Submit the program. A platform administrator must approve it before recipients can enroll or alerts can be sent.</li>
        </ol>
        <h3>API setup (authenticated client administrator)</h3>
        <p>The program-management endpoint requires a client administrator session. Ordinary application API keys cannot create or approve messaging programs.</p>
        <CodeBlock>{`POST ${baseUrl}/api/messaging-programs
Content-Type: application/json

{
  "name": "SwimSense Pool Alerts",
  "senderDisplayName": "SwimSense Pool Monitoring",
  "messageClass": "informational_recurring",
  "purpose": "Pool condition alerts, equipment warnings, and maintenance notifications",
  "expectedFrequency": "Message frequency varies based on pool conditions",
  "helpContact": "support@swimsense.example",
  "termsUrl": "https://swimsense.example/terms",
  "privacyUrl": "https://swimsense.example/privacy",
  "callbackUrl": "https://api.swimsense.example/webhooks/digicolony"
}`}</CodeBlock>
        <p>After approval, the SwimSense application calls <code>GET /api/messaging-programs</code> with its app key and stores the approved program ID.</p>
        <h3>Signup and account settings</h3>
        <ol>
          <li>Display the approved disclosure beside an unchecked SMS-alert checkbox. Never bundle consent into the general terms acceptance.</li>
          <li>After the user selects SMS alerts, post the phone number and evidence reference to <code>POST /api/recipient-authorizations</code>.</li>
          <li>Ask the user for the six-digit texted code and confirm it through the authorization confirmation endpoint.</li>
          <li>Send pool alerts only after the record reaches <code>verified_authorized</code>. Use the same flow later in Account Settings for users who did not opt in during signup.</li>
        </ol>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Authorize a Recipient</h2>
        <p className="muted">Ordinary messages require a verified authorization for an active messaging program. Use the hosted form or complete this client-embedded flow.</p>
        <h3>Option A: DigiColony-hosted form</h3>
        <ol>
          <li>In <strong>Recipient Consent</strong>, copy the full hosted-form URL for an active program.</li>
          <li>Send or link the recipient to that page. The recipient enters their mobile number and affirmatively accepts the approved disclosure.</li>
          <li>DigiColony sends the verification SMS and confirms the code on the hosted page. No client callback is required.</li>
        </ol>
        <h3>Option B: client signup or account settings</h3>
        <p>Use the program returned by <code>GET /api/messaging-programs</code>. Display its <code>disclosure_text</code> beside a separate unchecked control, and call the endpoints below only after the recipient selects it.</p>
        <CodeBlock>{`# 1. Start after the recipient accepts the approved disclosure
curl -X POST ${baseUrl}/api/recipient-authorizations \
  -H "Authorization: Bearer rhc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "programId": "11111111-1111-4111-8111-111111111111",
    "phoneNumber": "+13213609348",
    "clientRecipientReference": "owner-4821",
    "consentSource": "client_form",
    "recipientInitiated": true,
    "evidenceReference": "signup-owner-4821",
    "idempotencyKey": "owner-4821-sms-opt-in-v1"
  }'

# 2. Confirm the six-digit code supplied by the recipient
curl -X POST ${baseUrl}/api/recipient-authorizations/{authorizationId}/confirm \
  -H "Authorization: Bearer rhc_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"code":"123456"}'`}</CodeBlock>
        <p>The hosted alternative is <code>{baseUrl}/consent/&#123;programId&#125;</code>. STOP applies client-wide across all gateways; ambiguous STOP replies activate the platform failsafe suppression.</p>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Send a Message</h2>
        <p className="muted">This is the primary endpoint external applications use.</p>
        <Endpoint method="POST" path="/api/messages" auth="Client API key or admin session" />
        <FieldTable rows={[
          ["to", "string", "Yes", "Recipient number. E.164 is best; common US formats are normalized."],
          ["body", "string", "Yes", "SMS body. Maximum 1600 characters."],
          ["programId", "UUID", "Yes", "Active approved messaging program used to evaluate recipient authorization."],
          ["recipientAuthorizationId", "UUID", "No", "Pins the send to a specific verified authorization; otherwise the active program authorization is selected."],
          ["priority", "number", "No", "Lower values are claimed first. Defaults to 100."],
          ["scheduledAt", "ISO datetime", "No", "Delay sending until this time."],
          ["idempotencyKey", "string", "Recommended", "Prevents duplicate logical submissions per client."],
          ["metadata", "object", "No", "Flexible JSON for customer IDs, workflow IDs, or campaign data."],
          ["callbackUrl", "URL", "No", "Receives inbound reply callbacks for replies matched to this outbound message."],
          ["conversationId", "UUID", "No", "Send within an existing open conversation owned by this API key."],
          ["externalConversationReference", "string", "No", "Create or correlate the key-owned conversation to a SwimSense/Stratus workflow ID."]
        ]} />
        <h3>Response</h3>
        <CodeBlock>{`{
  "message": {
    "id": "ea90f927-dacc-45fa-9542-c6ecb0994ee2",
    "status": "queued",
    "to_number_redacted": "***-***-9348",
    "body": "Hello from ${platformName}",
    "idempotency_key": "order-123-confirmation",
    "submitted_via": "api",
    "created_at": "2026-07-11T20:10:30.000Z"
  }
}`}</CodeBlock>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Code Examples</h2>
        <div className="route-card-grid code-example-grid">
          <div>
            <h3>Node.js</h3>
            <CodeBlock>{`const response = await fetch("${baseUrl}/api/messages", {
  method: "POST",
  headers: {
    "Authorization": "Bearer " + process.env.RELAYHUB_API_KEY,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    to: "+13213609348",
    body: "Your requested property update is ready.",
    programId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "login-abc123-sms-1",
    metadata: { workflow: "login", userId: "abc123" },
    callbackUrl: "https://example.com/webhooks/relayhub"
  })
});

if (!response.ok) {
  throw new Error(await response.text());
}

const { message } = await response.json();
console.log(message.id, message.status);`}</CodeBlock>
          </div>
          <div>
            <h3>Python</h3>
            <CodeBlock>{`import os
import requests

response = requests.post(
    "${baseUrl}/api/messages",
    headers={
        "Authorization": f"Bearer {os.environ['RELAYHUB_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "to": "+13213609348",
        "body": "Your requested property update is ready.",
        "programId": "11111111-1111-4111-8111-111111111111",
        "idempotencyKey": "login-abc123-sms-1",
        "metadata": {"workflow": "login", "userId": "abc123"},
        "callbackUrl": "https://example.com/webhooks/relayhub",
    },
    timeout=15,
)

response.raise_for_status()
message = response.json()["message"]
print(message["id"], message["status"])`}</CodeBlock>
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Message Status and Lifecycle</h2>
        <table className="table">
          <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
          <tbody>
            {statuses.map(([status, meaning]) => <tr key={status}><td><code>{status}</code></td><td>{meaning}</td></tr>)}
          </tbody>
        </table>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Client Integration Endpoints</h2>
        <EndpointTable rows={clientEndpoints} />
        <h3>Read message status</h3>
        <CodeBlock>{`curl ${baseUrl}/api/messages/ea90f927-dacc-45fa-9542-c6ecb0994ee2 \\
  -H "Authorization: Bearer rhc_your_api_key"`}</CodeBlock>
        <h3>Cancel or requeue</h3>
        <CodeBlock>{`curl -X POST ${baseUrl}/api/messages/{messageId}/cancel \\
  -H "Authorization: Bearer rhc_your_api_key"

curl -X POST ${baseUrl}/api/messages/{messageId}/requeue \\
  -H "Authorization: Bearer rhc_your_api_key"`}</CodeBlock>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Conversation Threads and Key-level Webhooks</h2>
        <p>
          Every API-originated message belongs to a conversation owned by the exact API key that sent it. Replies are matched by gateway,
          participant, and recent submitted conversation, then appear in the conversation timeline and in subscribed webhook events.
        </p>
        <CodeBlock>{`# Subscribe this API key to its events
curl -X POST ${baseUrl}/api/webhook-subscriptions \\
  -H "Authorization: Bearer rhc_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "callbackUrl": "https://api.swimsense.example/webhooks/digicolony",
    "description": "SwimSense production sync",
    "eventTypes": ["sms.inbound.received", "sms.outbound.delivery_confirmed", "sms.outbound.delivery_failed"]
  }'

# Open a thread linked to a client workflow
curl -X POST ${baseUrl}/api/conversations \\
  -H "Authorization: Bearer rhc_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+13213609348",
    "programId": "11111111-1111-4111-8111-111111111111",
    "externalReference": "pool-alert-8821"
  }'`}</CodeBlock>
        <p>Subscription creation returns a signing secret. Store it securely and verify every delivery. The envelope is stable and versioned:</p>
        <CodeBlock>{`{
  "id": "event-uuid",
  "type": "sms.inbound.received",
  "schemaVersion": "2026-07-22",
  "occurredAt": "2026-07-22T20:17:04.000Z",
  "organizationId": "organization-uuid",
  "apiClientId": "application-uuid",
  "apiClientKeyId": "exact-key-uuid",
  "messageId": "matched-outbound-uuid",
  "conversationId": "conversation-uuid",
  "inboundMessageId": "inbound-uuid",
  "recipientAuthorizationId": null,
  "data": {
    "conversation": { "externalReference": "pool-alert-8821" },
    "inboundMessage": { "from": "+13213609348", "body": "I can visit Friday at 2" }
  }
}`}</CodeBlock>
        <p className="muted">
          Webhooks include <code>x-relayhub-timestamp</code>, <code>x-relayhub-signature</code>, and a delivery ID.
          Verify the signature as HMAC-SHA256 of <code>timestamp.body</code>.
        </p>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Error Handling</h2>
        <table className="table">
          <thead><tr><th>Status</th><th>When it happens</th><th>Recommended handling</th></tr></thead>
          <tbody>
            <tr><td>400</td><td>Invalid JSON, phone number, URL, or field validation.</td><td>Fix the request and retry with the same idempotency key only if it is the same logical message.</td></tr>
            <tr><td>401</td><td>Missing or invalid API key.</td><td>Check the key, environment, and key status.</td></tr>
            <tr><td>403</td><td>Authenticated but not allowed, or gateway disabled.</td><td>Review role/key permissions.</td></tr>
            <tr><td>404</td><td>Resource not found or outside the caller scope.</td><td>Confirm ID and client context.</td></tr>
            <tr><td>409</td><td>Message cannot transition to the requested state.</td><td>Fetch the message and inspect current status.</td></tr>
          </tbody>
        </table>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Admin and Gateway API Reference</h2>
        <h3>Admin endpoints</h3>
        <EndpointTable rows={adminEndpoints} />
        <h3>Gateway appliance endpoints</h3>
        <EndpointTable rows={gatewayEndpoints} />
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Gateway Health Payload</h2>
        <p className="muted">Gateway health powers operator status, signal quality, and failover decisions.</p>
        <Endpoint method="POST" path="/api/gateway/heartbeat" auth="Gateway API key" />
        <CodeBlock>{`{
  "status": "online",
  "softwareVersion": "0.1.0",
  "hardwareType": "RelayHub Edge One",
  "carrier": "Tello",
  "apnProfile": null,
  "metrics": {
    "signalQuality": {
      "level": "excellent",
      "rssiDbm": -67,
      "bars": 5
    },
    "modem": {
      "registered": true,
      "networkMode": "LTE Cat-M"
    }
  }
}`}</CodeBlock>
      </section>
    </>
  );
}

function Endpoint({ method, path, auth }: { method: string; path: string; auth: string }) {
  return (
    <div className="relationship-row" style={{ margin: "12px 0" }}>
      <span className="chip good">{method}</span>
      <code>{path}</code>
      <span className="muted">{auth}</span>
    </div>
  );
}

function EndpointTable({ rows }: { rows: string[][] }) {
  return (
    <table className="table">
      <thead><tr><th>Method</th><th>Endpoint</th><th>Auth</th><th>Purpose</th></tr></thead>
      <tbody>
        {rows.map(([method, path, auth, purpose]) => (
          <tr key={`${method}-${path}`}>
            <td><span className="chip">{method}</span></td>
            <td><code>{path}</code></td>
            <td>{auth}</td>
            <td>{purpose}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FieldTable({ rows }: { rows: string[][] }) {
  return (
    <table className="table">
      <thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
      <tbody>
        {rows.map(([field, type, required, description]) => (
          <tr key={field}>
            <td><code>{field}</code></td>
            <td>{type}</td>
            <td>{required}</td>
            <td>{description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DocFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="object-row">
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return <pre><code>{children}</code></pre>;
}
