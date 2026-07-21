import { transaction } from "@/lib/db";

export async function runMaintenanceJobs() {
  return transaction(async (client) => {
    await client.query("DELETE FROM daily_usage_rollups WHERE usage_date >= (current_date - interval '120 days')::date");

    const rollup = await client.query(
      `INSERT INTO daily_usage_rollups (
         organization_id, api_client_id, gateway_id, usage_date,
         outbound_count, submitted_count, failed_count, inbound_count
       )
       WITH usage_rows AS (
         SELECT organization_id,
                api_client_id,
                claim_gateway_id AS gateway_id,
                created_at::date AS usage_date,
                1 AS outbound_count,
                CASE WHEN status = 'carrier_submitted' THEN 1 ELSE 0 END AS submitted_count,
                CASE WHEN status IN ('failed', 'dead_lettered') THEN 1 ELSE 0 END AS failed_count,
                0 AS inbound_count
           FROM messages
          WHERE created_at >= now() - interval '120 days'
         UNION ALL
         SELECT organization_id,
                NULL::uuid AS api_client_id,
                gateway_id,
                created_at::date AS usage_date,
                0 AS outbound_count,
                0 AS submitted_count,
                0 AS failed_count,
                1 AS inbound_count
           FROM inbound_messages
          WHERE created_at >= now() - interval '120 days'
       )
       SELECT organization_id,
              api_client_id,
              gateway_id,
              usage_date,
              SUM(outbound_count)::int,
              SUM(submitted_count)::int,
              SUM(failed_count)::int,
              SUM(inbound_count)::int
         FROM usage_rows
        GROUP BY organization_id, api_client_id, gateway_id, usage_date`
    );

    const logs = await client.query(
      "DELETE FROM gateway_logs WHERE created_at < now() - interval '90 days'"
    );
    const health = await client.query(
      "DELETE FROM gateway_health WHERE created_at < now() - interval '90 days'"
    );

    return {
      rollupRows: rollup.rowCount || 0,
      deletedLogRows: logs.rowCount || 0,
      deletedHealthRows: health.rowCount || 0
    };
  });
}
