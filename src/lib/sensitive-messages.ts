const SECURITY_MESSAGE_TYPES = new Set(["password_reset", "mobile_verification"]);

export const HIDDEN_SECURITY_MESSAGE_BODY = "[Security code hidden]";

export function isSecurityMessage(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return false;
  const systemType = (metadata as Record<string, unknown>).systemType;
  return typeof systemType === "string" && SECURITY_MESSAGE_TYPES.has(systemType);
}

export function redactSensitiveMessage<T extends { body?: string; metadata?: unknown }>(message: T): T {
  if (!isSecurityMessage(message.metadata)) return message;
  return { ...message, body: HIDDEN_SECURITY_MESSAGE_BODY };
}
