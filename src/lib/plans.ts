import { query } from "@/lib/db";

export async function listPublicPlans() {
  const result = await query(
    `SELECT slug, name, description, monthly_message_limit, included_users,
            included_api_keys, included_gateways, private_gateway_allowed,
            callback_allowed, log_retention_days, support_level, display_price
       FROM plans
      WHERE is_public = true
      ORDER BY sort_order ASC, monthly_message_limit ASC`
  );
  return result.rows;
}

export async function getOrganizationPlanUsage(organizationId: string) {
  const result = await query(
    `SELECT COUNT(DISTINCT m.id) FILTER (
              WHERE m.created_at >= date_trunc('month', now())
            )::int AS monthly_messages,
            COUNT(DISTINCT om.user_id) FILTER (
              WHERE om.role <> 'platform_admin'
            )::int AS users,
            COUNT(DISTINCT k.id) FILTER (
              WHERE k.status = 'active'
            )::int AS api_keys,
            COUNT(DISTINCT ga.gateway_id) FILTER (
              WHERE ga.access_level IN ('details', 'manage')
            )::int AS visible_private_gateways
       FROM organizations o
       LEFT JOIN messages m ON m.organization_id = o.id
       LEFT JOIN organization_memberships om ON om.organization_id = o.id
       LEFT JOIN api_clients c ON c.organization_id = o.id
       LEFT JOIN api_client_keys k ON k.api_client_id = c.id
       LEFT JOIN gateway_access ga ON ga.organization_id = o.id
      WHERE o.id = $1`,
    [organizationId]
  );
  return result.rows[0] || {
    monthly_messages: 0,
    users: 0,
    api_keys: 0,
    visible_private_gateways: 0
  };
}

export async function assertPlanCapacity(
  organizationId: string,
  plan: {
    monthlyMessageLimit: number;
    includedUsers: number;
    includedApiKeys: number;
    includedGateways: number;
    callbackAllowed: boolean;
  },
  resource: "message" | "user" | "api_key" | "gateway" | "callback"
) {
  if (resource === "callback" && !plan.callbackAllowed) {
    throw new Error("Callbacks are not included in this account plan");
  }

  const usage = await getOrganizationPlanUsage(organizationId);
  if (resource === "message" && Number(usage.monthly_messages || 0) >= plan.monthlyMessageLimit) {
    throw new Error("Monthly message limit exceeded for this account plan");
  }
  if (resource === "user" && Number(usage.users || 0) >= plan.includedUsers) {
    throw new Error("User limit exceeded for this account plan");
  }
  if (resource === "api_key" && Number(usage.api_keys || 0) >= plan.includedApiKeys) {
    throw new Error("API key limit exceeded for this account plan");
  }
  if (resource === "gateway" && Number(usage.visible_private_gateways || 0) >= plan.includedGateways) {
    throw new Error("Gateway limit exceeded for this account plan");
  }
}
