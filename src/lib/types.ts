export type MessageStatus =
  | "queued"
  | "claimed"
  | "sending"
  | "carrier_submitted"
  | "retry_scheduled"
  | "failed"
  | "dead_lettered"
  | "canceled";

export type GatewayStatus = "unknown" | "online" | "degraded" | "offline" | "disabled" | "maintenance";

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export type GatewayAuth = {
  id: string;
  name: string;
  status: GatewayStatus;
  organization_id: string;
};
