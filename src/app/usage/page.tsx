import { runMaintenanceAction } from "@/app/actions";
import { query } from "@/lib/db";
import { listOrganizationsForUser } from "@/lib/organizations";
import { requireAdminPage } from "@/lib/page-auth";
import { hasRole } from "@/lib/rbac";

export default async function UsagePage() {
  const session = await requireAdminPage();
  const clients = await listOrganizationsForUser(session.user.id, session.user.role);
  const clientIds = clients.map((client: any) => client.id);
  const canOperate = hasRole(session, "operator");
  const [summary, byClient, byApiApp, rollups] = await Promise.all([
    query(
      `SELECT COUNT(DISTINCT o.id)::int AS client_count,
              COUNT(DISTINCT u.user_id) FILTER (
                WHERE u.role <> 'platform_admin'
                  AND au.role NOT IN ('platform_admin', 'admin')
              )::int AS user_count,
              COUNT(DISTINCT c.id)::int AS api_app_count,
              COUNT(DISTINCT g.id)::int AS gateway_count,
              COUNT(DISTINCT m.id)::int AS outbound_count,
              COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'carrier_submitted')::int AS submitted_count,
              COUNT(DISTINCT i.id)::int AS inbound_count,
              COUNT(DISTINCT m.id) FILTER (WHERE m.created_at >= now() - interval '24 hours')::int AS outbound_24h,
              COUNT(DISTINCT i.id) FILTER (WHERE i.received_at >= now() - interval '24 hours')::int AS inbound_24h
         FROM organizations o
         LEFT JOIN organization_memberships u ON u.organization_id = o.id
         LEFT JOIN admin_users au ON au.id = u.user_id
         LEFT JOIN api_clients c ON c.organization_id = o.id
         LEFT JOIN gateways g ON g.organization_id = o.id
         LEFT JOIN messages m ON m.organization_id = o.id
         LEFT JOIN inbound_messages i ON i.organization_id = o.id
        WHERE o.id = ANY($1::uuid[])`,
      [clientIds]
    ),
    query(
      `SELECT o.name,
              COUNT(m.id)::int AS outbound_count,
              COUNT(m.id) FILTER (WHERE m.status = 'carrier_submitted')::int AS submitted_count,
              COUNT(i.id)::int AS inbound_count
         FROM organizations o
         LEFT JOIN messages m ON m.organization_id = o.id
         LEFT JOIN inbound_messages i ON i.organization_id = o.id
        WHERE o.id = ANY($1::uuid[])
        GROUP BY o.id, o.name
        ORDER BY outbound_count DESC, o.name ASC`,
      [clientIds]
    ),
    query(
      `SELECT COALESCE(c.name, 'Dashboard') AS source,
              COUNT(m.id)::int AS outbound_count,
              COUNT(m.id) FILTER (WHERE m.created_at >= now() - interval '24 hours')::int AS outbound_24h,
              COUNT(m.id) FILTER (WHERE m.status = 'carrier_submitted')::int AS submitted_count,
              COUNT(m.id) FILTER (WHERE m.status IN ('failed', 'dead_lettered'))::int AS problem_count
         FROM messages m
         LEFT JOIN api_clients c ON c.id = m.api_client_id
        WHERE m.organization_id = ANY($1::uuid[])
        GROUP BY c.id, c.name
        ORDER BY outbound_count DESC, source ASC
        LIMIT 8`,
      [clientIds]
    ),
    query(
      `SELECT usage_date,
              SUM(outbound_count)::int AS outbound_count,
              SUM(submitted_count)::int AS submitted_count,
              SUM(failed_count)::int AS failed_count,
              SUM(inbound_count)::int AS inbound_count
         FROM daily_usage_rollups
        WHERE organization_id = ANY($1::uuid[])
          AND usage_date >= current_date - interval '14 days'
        GROUP BY usage_date
        ORDER BY usage_date ASC`,
      [clientIds]
    )
  ]);
  const totals = summary.rows[0] || {};
  const deliveryRate = totals.outbound_count
    ? Math.round((Number(totals.submitted_count || 0) / Number(totals.outbound_count || 1)) * 1000) / 10
    : 100;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="muted">System dashboard</p>
          <h1>Usage</h1>
          <p>Client, user, API app, message, reply, and delivery trends across visible clients.</p>
        </div>
        {canOperate ? (
          <form action={runMaintenanceAction}>
            <button className="primary" type="submit">Refresh rollups</button>
          </form>
        ) : null}
      </header>

      <section className="metric-grid">
        <MetricCard label="Clients" value={totals.client_count || 0} note="Tenant accounts" />
        <MetricCard label="Users" value={totals.user_count || 0} note="Client members" />
        <MetricCard label="Outbound" value={totals.outbound_count || 0} note={`${totals.outbound_24h || 0} in 24h`} />
        <MetricCard label="Inbound" value={totals.inbound_count || 0} note={`${totals.inbound_24h || 0} in 24h`} />
      </section>

      <div className="grid">
        <section className="panel">
          <h2>Top clients by message volume</h2>
          <div className="object-list">
            {byClient.rows.map((row: any, index: number) => (
              <div className="relationship-row" key={row.name}>
                <span style={{ width: 18 }}>{index + 1}</span>
                <strong style={{ width: 160 }}>{row.name}</strong>
                <div style={{ background: "#e8eef8", borderRadius: 999, flex: 1, height: 6 }}>
                  <div style={{ background: "#3b82f6", borderRadius: 999, height: 6, width: `${Math.max(4, Math.min(100, row.outbound_count || 0))}%` }} />
                </div>
                <span>{row.outbound_count}</span>
              </div>
            ))}
            {!byClient.rows.length ? <p className="muted">No client usage yet.</p> : null}
          </div>
        </section>

        <section className="panel">
          <h2>Delivery rate</h2>
          <div className="relationship-row" style={{ justifyContent: "center", gap: 22 }}>
            <div className="donut" style={{ "--value": `${deliveryRate}%` } as any}><span>{deliveryRate}%</span></div>
            <div>
              <p><span className="chip good">Submitted</span> {totals.submitted_count || 0}</p>
              <p><span className="chip">API apps</span> {totals.api_app_count || 0}</p>
              <p><span className="chip">Gateways</span> {totals.gateway_count || 0}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>API app usage</h2>
        <table className="table">
          <thead><tr><th>API app</th><th>Total outbound</th><th>24h outbound</th><th>Submitted</th><th>Problems</th></tr></thead>
          <tbody>
            {byApiApp.rows.map((row: any) => (
              <tr key={row.source}>
                <td>{row.source}</td>
                <td>{row.outbound_count}</td>
                <td>{row.outbound_24h}</td>
                <td>{row.submitted_count}</td>
                <td>{row.problem_count}</td>
              </tr>
            ))}
            {!byApiApp.rows.length ? <tr><td colSpan={5}>No API app usage yet.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Daily trend</h2>
        <table className="table">
          <thead><tr><th>Date</th><th>Outbound</th><th>Submitted</th><th>Failed</th><th>Inbound</th></tr></thead>
          <tbody>
            {rollups.rows.map((row: any) => (
              <tr key={String(row.usage_date)}>
                <td>{new Date(row.usage_date).toLocaleDateString()}</td>
                <td>{row.outbound_count}</td>
                <td>{row.submitted_count}</td>
                <td>{row.failed_count}</td>
                <td>{row.inbound_count}</td>
              </tr>
            ))}
            {!rollups.rows.length ? <tr><td colSpan={5}>No rollups yet. Run maintenance to populate.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}
