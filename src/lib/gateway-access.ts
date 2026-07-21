import { query } from "@/lib/db";

export type GatewayAccessLevel = "none" | "status_only" | "details" | "manage";

const accessRank: Record<GatewayAccessLevel, number> = {
  none: 0,
  status_only: 1,
  details: 2,
  manage: 3
};

export function hasGatewayAccessLevel(actual: GatewayAccessLevel, required: GatewayAccessLevel) {
  return accessRank[actual] >= accessRank[required];
}

export async function getGatewayAccessLevel(input: {
  gatewayId: string;
  organizationId: string;
  isPlatformAdmin?: boolean;
}) {
  if (input.isPlatformAdmin) return "manage" as GatewayAccessLevel;

  const result = await query(
    `SELECT CASE
              WHEN g.owner_organization_id = $2 THEN 'manage'
              WHEN g.organization_id = $2 AND g.visibility <> 'shared' THEN 'manage'
              ELSE COALESCE(ga.access_level, 'none')
            END AS access_level
       FROM gateways g
       LEFT JOIN gateway_access ga
         ON ga.gateway_id = g.id
        AND ga.organization_id = $2
      WHERE g.id = $1`,
    [input.gatewayId, input.organizationId]
  );
  return (result.rows[0]?.access_level || "none") as GatewayAccessLevel;
}

export function gatewayVisibilityClause(alias = "g") {
  return `(
    $2::boolean = true
    OR ${alias}.owner_organization_id = $1
    OR (${alias}.organization_id = $1 AND ${alias}.visibility <> 'shared')
    OR EXISTS (
      SELECT 1
        FROM gateway_access ga_filter
       WHERE ga_filter.gateway_id = ${alias}.id
         AND ga_filter.organization_id = $1
         AND ga_filter.access_level IN ('status_only', 'details', 'manage')
    )
  )`;
}
