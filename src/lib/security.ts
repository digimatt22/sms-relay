import crypto from "node:crypto";

export function redactPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return last4 ? `***-***-${last4}` : "***";
}

export function hashPassword(value: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(value, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(value: string, stored: string) {
  const [kind, salt, expected] = stored.split(":");
  if (kind !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(value, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
}

export function createGatewayKey() {
  return `rly_${crypto.randomBytes(32).toString("base64url")}`;
}

export function createClientKey() {
  return `rhc_${crypto.randomBytes(32).toString("base64url")}`;
}

export function createInvitationToken() {
  return `rhi_${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashGatewayKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function hashApiKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function hashInvitationToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function gatewayKeyPrefix(key: string) {
  return key.slice(0, 12);
}

export function apiKeyPrefix(key: string) {
  return key.slice(0, 12);
}
