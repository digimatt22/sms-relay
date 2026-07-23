import { createHmac } from "node:crypto";

export function deriveWebhookSigningSecret(subscriptionId: string) {
  const master = process.env.RELAYHUB_WEBHOOK_SECRET;
  if (!master) throw new Error("RELAYHUB_WEBHOOK_SECRET is required for webhook subscriptions");
  return `whsec_${createHmac("sha256", master).update(`subscription:${subscriptionId}`).digest("base64url")}`;
}

export function createWebhookRequest(
  callbackUrl: string,
  payload: unknown,
  signingSecret?: string | null,
  deliveryId?: string | null
) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = signingSecret || process.env.RELAYHUB_WEBHOOK_SECRET;

  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    headers["x-relayhub-timestamp"] = timestamp;
    headers["x-relayhub-signature"] = `sha256=${signature}`;
  }
  if (deliveryId) headers["x-relayhub-delivery"] = deliveryId;

  return {
    url: callbackUrl,
    init: {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000)
    }
  };
}
