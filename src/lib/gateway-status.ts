import { humanize } from "@/lib/format";

const STALE_AFTER_MS = 5 * 60 * 1000;
const OFFLINE_AFTER_MS = 15 * 60 * 1000;

export function effectiveGatewayStatus(gateway: {
  status?: string | null;
  last_heartbeat_at?: string | Date | null;
}) {
  if (gateway.status === "disabled" || gateway.status === "maintenance" || gateway.status === "offline") {
    return gateway.status;
  }

  if (!gateway.last_heartbeat_at) return "offline";

  const ageMs = Date.now() - new Date(gateway.last_heartbeat_at).getTime();
  if (ageMs > OFFLINE_AFTER_MS) return "offline";
  if (ageMs > STALE_AFTER_MS) return "degraded";
  return gateway.status || "unknown";
}

export function gatewayStatusLabel(status: string) {
  if (status === "degraded") return "Stale";
  return humanize(status);
}

export function gatewayStatusClass(status: string) {
  if (status === "degraded") return "warning";
  return status;
}
