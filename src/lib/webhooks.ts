import { createHmac } from "node:crypto";

export function createWebhookRequest(callbackUrl: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.RELAYHUB_WEBHOOK_SECRET;

  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    headers["x-relayhub-timestamp"] = timestamp;
    headers["x-relayhub-signature"] = `sha256=${signature}`;
  }

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
