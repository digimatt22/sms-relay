import { requireAdminPage } from "@/lib/page-auth";
import { query } from "@/lib/db";
import { humanize } from "@/lib/format";
import { getAccountContext } from "@/lib/account-context";
import { gatewayVisibilityClause } from "@/lib/gateway-access";

export default async function LogsPage() {
  const session = await requireAdminPage();
  const account = await getAccountContext(session);
  const logs = await query(
    `SELECT l.*, g.name AS gateway_name
       FROM gateway_logs l
       JOIN gateways g ON g.id = l.gateway_id
      WHERE l.organization_id = $1
        AND ${gatewayVisibilityClause("g")}
        AND (
          $2::boolean = true
          OR g.owner_organization_id = $1
          OR g.organization_id = $1 AND g.visibility <> 'shared'
          OR EXISTS (
            SELECT 1
              FROM gateway_access ga_detail
             WHERE ga_detail.gateway_id = g.id
               AND ga_detail.organization_id = $1
               AND ga_detail.access_level IN ('details', 'manage')
          )
        )
      ORDER BY l.created_at DESC
      LIMIT 300`,
    [account.organizationId, account.isPlatformAdmin]
  );

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Logs</h1>
          <p>Gateway events and diagnostics</p>
        </div>
      </header>
      <table className="table">
        <thead><tr><th>Time</th><th>Gateway</th><th>Level</th><th>Event</th><th>Message</th></tr></thead>
        <tbody>
          {logs.rows.map((log: any) => (
            <tr key={log.id}>
              <td>{new Date(log.created_at).toLocaleString()}</td>
              <td>{log.gateway_name || "-"}</td>
              <td>{log.level}</td>
              <td>{humanize(log.event_type)}</td>
              <td>{log.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
