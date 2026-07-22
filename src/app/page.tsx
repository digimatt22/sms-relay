import Link from "next/link";
import { Send } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import { query } from "@/lib/db";
import { humanize } from "@/lib/format";
import { effectiveGatewayStatus } from "@/lib/gateway-status";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { requireAdminPage } from "@/lib/page-auth";
import { hasRole } from "@/lib/rbac";

export default async function CommandCenterPage() {
  const session = await requireAdminPage();
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const canOperate = hasRole(session, "operator");

  const [queue, gateways, alerts, usage, recentMessages] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('queued', 'retry_scheduled', 'claimed', 'sending'))::int AS active_queue,
         COUNT(*) FILTER (WHERE status = 'carrier_submitted' AND created_at >= now() - interval '24 hours')::int AS submitted_24h,
         COUNT(*) FILTER (WHERE status IN ('failed', 'dead_lettered') AND created_at >= now() - interval '24 hours')::int AS problem_24h,
         COUNT(*) FILTER (WHERE status = 'dead_lettered')::int AS dead_lettered
       FROM messages
      WHERE organization_id = $1`,
      [organizationId]
    ),
    query(
      `SELECT id, status, last_heartbeat_at
       FROM gateways
      WHERE organization_id = $1`,
      [organizationId]
    ),
    query(
      `SELECT *
         FROM alerts
        WHERE organization_id = $1
          AND status = 'open'
        ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                 opened_at DESC
        LIMIT 5`,
      [organizationId]
    ),
    query(
      `SELECT COALESCE(c.name, 'Dashboard') AS source,
              COALESCE(c.id::text, 'dashboard') AS source_id,
              COUNT(m.id) FILTER (WHERE m.created_at >= now() - interval '24 hours')::int AS messages_24h,
              COUNT(m.id) FILTER (WHERE m.status = 'carrier_submitted' AND m.created_at >= now() - interval '24 hours')::int AS submitted_24h,
              COUNT(m.id) FILTER (WHERE m.status IN ('failed', 'dead_lettered') AND m.created_at >= now() - interval '24 hours')::int AS problem_24h
         FROM messages m
         LEFT JOIN api_clients c ON c.id = m.api_client_id
        WHERE m.organization_id = $1
        GROUP BY c.id, c.name
        ORDER BY messages_24h DESC, source ASC
        LIMIT 5`,
      [organizationId]
    ),
    query(
      `SELECT m.*,
              CASE
                WHEN COALESCE(m.metadata->>'systemType', '') IN ('password_reset', 'mobile_verification') THEN '[Security code hidden]'
                ELSE m.body
              END AS body,
              c.name AS api_client_name, g.name AS gateway_name
         FROM messages m
         LEFT JOIN api_clients c ON c.id = m.api_client_id
         LEFT JOIN gateways g ON g.id = m.claim_gateway_id
        WHERE m.organization_id = $1
        ORDER BY m.created_at DESC
        LIMIT 8`,
      [organizationId]
    )
  ]);

  const queueStats = queue.rows[0] || {};
  const gatewayStatuses = gateways.rows.map((gateway: any) => effectiveGatewayStatus(gateway));
  const gatewayStats = {
    total: gateways.rows.length,
    online: gatewayStatuses.filter((status: string) => status === "online").length,
    stale: gatewayStatuses.filter((status: string) => status === "degraded").length,
    unavailable: gatewayStatuses.filter((status: string) => ["offline", "disabled", "maintenance"].includes(status)).length
  };
  const fleetStatus = gatewayStats.unavailable || gatewayStats.stale ? "Needs attention" : "Healthy";
  const queueTotal = Number(queueStats.active_queue || 0) + Number(queueStats.submitted_24h || 0) + Number(queueStats.dead_lettered || 0);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Command Center</h1>
          <p>Operational view of queue health, gateway readiness, client traffic, and incidents</p>
        </div>
        <div className="actions-row">
          {canOperate ? <Link className="button" href="/messages/new"><Send size={16} />Send Message</Link> : null}
          <Link className="button secondary" href="/alerts">Review alerts</Link>
        </div>
      </header>

      <section className="metric-grid" aria-label="Operations summary">
        <MetricCard label="Active queue" value={queueStats.active_queue || 0} note="Queued, claimed, sending, or scheduled retry" />
        <MetricCard label="Submitted 24h" value={queueStats.submitted_24h || 0} note="Carrier accepted outbound messages" />
        <MetricCard label="Problems 24h" value={queueStats.problem_24h || 0} note={`${queueStats.dead_lettered || 0} total dead-lettered`} />
        <MetricCard label="Fleet" value={`${gatewayStats.online || 0}/${gatewayStats.total || 0}`} note={fleetStatus} />
      </section>

      <div className="command-grid">
        <div className="section-stack">
          <section className="panel">
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <h2>Queue Triage</h2>
                <p className="muted">Recent outbound messages with their source and gateway relationship</p>
              </div>
              <Link className="button secondary" href="/messages">Open queue</Link>
            </div>
            <table className="table desktop-only">
              <thead><tr><th>Status</th><th>Recipient</th><th>Source</th><th>Gateway</th><th>Created</th></tr></thead>
              <tbody>
                {recentMessages.rows.map((message: any) => (
                  <tr key={message.id}>
                    <td><span className={`status ${message.status}`}>{humanize(message.status)}</span></td>
                    <td><Link href={`/messages/${message.id}`}>{message.to_number_redacted}</Link></td>
                    <td>{message.api_client_name || humanize(message.submitted_via || "dashboard")}</td>
                    <td>{message.gateway_name || "-"}</td>
                    <td><LocalDateTime value={message.created_at} /></td>
                  </tr>
                ))}
                {!recentMessages.rows.length ? <tr><td colSpan={5}>No outbound messages yet.</td></tr> : null}
              </tbody>
            </table>
            <div className="mobile-only mobile-card-list">
              {recentMessages.rows.map((message: any) => (
                <Link className="mobile-card" href={`/messages/${message.id}`} key={message.id}>
                  <div className="mobile-card-main">
                    <div>
                      <div className="mobile-card-title">{message.to_number_redacted}</div>
                      <div className="mobile-card-body">{message.body}</div>
                    </div>
                    <span className={`status ${message.status}`}>{humanize(message.status)}</span>
                  </div>
                  <div className="mobile-card-meta">
                    <span>Source: {message.api_client_name || humanize(message.submitted_via || "dashboard")}</span>
                    <span>Gateway: {message.gateway_name || "-"}</span>
                    <span><LocalDateTime value={message.created_at} /></span>
                  </div>
                </Link>
              ))}
              {!recentMessages.rows.length ? <p className="muted">No outbound messages yet.</p> : null}
            </div>
          </section>

          <section className="panel">
            <div className="page-header" style={{ marginBottom: 12 }}>
              <div>
                <h2>Client Traffic</h2>
                <p className="muted">Which integrations are submitting work and where problems are concentrated</p>
              </div>
              <Link className="button secondary" href="/clients">Open API apps</Link>
            </div>
            <div className="object-list">
              {usage.rows.map((row: any) => (
                <div className="object-row" key={row.source_id}>
                  <div>
                    <div className="object-title">{row.source}</div>
                    <div className="object-meta">{row.messages_24h} messages in 24h, {row.submitted_24h} submitted</div>
                  </div>
                  <span className={`chip ${row.problem_24h ? "bad" : "good"}`}>{row.problem_24h} problems</span>
                </div>
              ))}
              {!usage.rows.length ? <p className="muted">No client traffic yet.</p> : null}
            </div>
          </section>
        </div>

        <aside className="section-stack">
          <section className="panel">
            <h2>Queue Health</h2>
            {queueTotal > 0 ? (
              <div className="object-list" style={{ margin: "12px 0" }}>
                <div className="object-row"><span className="chip">Pending</span><strong>{queueStats.active_queue || 0}</strong></div>
                <div className="object-row"><span className="chip good">Submitted 24h</span><strong>{queueStats.submitted_24h || 0}</strong></div>
                <div className="object-row"><span className="chip bad">Dead Lettered</span><strong>{queueStats.dead_lettered || 0}</strong></div>
              </div>
            ) : (
              <div className="empty-state">
                <strong>Queue is empty</strong>
                <p className="muted">No queued, retrying, submitted, or dead-lettered messages are currently present.</p>
              </div>
            )}
            <p className="muted">Live view of outbound queue health and oldest retry pressure.</p>
          </section>

          <section className="panel">
            <h2>Fleet Readiness</h2>
            <div className="relationship-row" style={{ marginBottom: 12 }}>
              <span className="chip good">{gatewayStats.online || 0} online</span>
              <span className={`chip ${gatewayStats.stale ? "warn" : "good"}`}>{gatewayStats.stale || 0} stale</span>
              <span className={`chip ${gatewayStats.unavailable ? "bad" : "good"}`}>{gatewayStats.unavailable || 0} unavailable</span>
            </div>
            <p className="muted">Gateways claim messages through pools. Stale or unavailable gateways are excluded from assignment.</p>
            <div className="actions-row" style={{ justifyContent: "flex-start", marginTop: 14 }}>
              <Link className="button secondary" href="/gateways">Fleet</Link>
              <Link className="button secondary" href="/routing">Routing</Link>
            </div>
          </section>

          <section className="panel">
            <h2>Open Incidents</h2>
            <div className="object-list">
              {alerts.rows.map((alert: any) => (
                <div className="object-row" key={alert.id}>
                  <div>
                    <div className="object-title">{humanize(alert.alert_type)}</div>
                    <div className="object-meta">{alert.message}</div>
                  </div>
                  <span className={`status ${alert.severity}`}>{humanize(alert.severity)}</span>
                </div>
              ))}
              {!alerts.rows.length ? <p className="muted">No open alerts.</p> : null}
            </div>
          </section>
        </aside>
      </div>
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
