import type { GatewayConfig } from "./config.js";

type Json = Record<string, unknown>;

export type GatewayCommand = {
  id: string;
  command_type: string;
  payload: Json;
  requested_at: string;
};

export class RelayHubApi {
  constructor(private readonly config: GatewayConfig) {}

  async heartbeat(metrics: Json = {}) {
    return this.post("/api/gateway/heartbeat", {
      status: "online",
      softwareVersion: this.config.softwareVersion,
      hardwareType: "RelayHub Edge One",
      carrier: this.config.carrier,
      apnProfile: this.config.apn,
      metrics
    });
  }

  async sendLogs(logs: Array<{ level: string; eventType: string; message: string; context?: Json }>) {
    if (!logs.length) return;
    return this.post("/api/gateway/logs", { logs });
  }

  async claimMessage() {
    const response = await this.post<{ message: null | any }>("/api/gateway/messages/claim", {});
    return response.message;
  }

  async startAttempt(messageId: string) {
    const response = await this.post<{ attempt: any }>(`/api/gateway/messages/${messageId}/attempts/start`, {});
    return response.attempt;
  }

  async markSubmitted(messageId: string, attemptId: string, modemResponse: string) {
    return this.post(`/api/gateway/messages/${messageId}/attempts/${attemptId}/submitted`, { modemResponse });
  }

  async markFailed(messageId: string, attemptId: string, errorMessage: string, context: Json = {}) {
    return this.post(`/api/gateway/messages/${messageId}/attempts/${attemptId}/failed`, { errorMessage, context });
  }

  async ingestInboundMessages(messages: Array<{
    modemIndex: number;
    from: string;
    body: string;
    receivedAt: string;
    messageStatus?: string;
    serviceCenter?: string;
  }>) {
    if (!messages.length) return { messages: [] };
    return this.post<{ messages: Array<{ id: string; modemIndex: number; callbackStatus: string }> }>("/api/gateway/inbound", {
      messages: messages.map((message) => ({
        ...message,
        metadata: {
          source: "sim7070_cmgl"
        }
      }))
    });
  }

  async claimCommands() {
    const response = await this.post<{ commands: GatewayCommand[] }>("/api/gateway/commands/claim", { limit: 5 });
    return response.commands;
  }

  async completeCommand(commandId: string, status: "completed" | "failed", result: Json = {}) {
    return this.post(`/api/gateway/commands/${commandId}/complete`, { status, result });
  }

  private async post<T = Json>(path: string, body: Json): Promise<T> {
    const response = await fetch(`${this.config.hubUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`RelayHub API ${path} failed: ${response.status} ${text}`);
    }
    return response.json() as Promise<T>;
  }
}
