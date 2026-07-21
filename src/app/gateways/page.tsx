import Link from "next/link";
import { Plus, RadioTower, RefreshCw } from "lucide-react";
import { requireAdminPage } from "@/lib/page-auth";
import { query } from "@/lib/db";
import { createGatewayAction } from "@/app/actions";
import { humanize } from "@/lib/format";
import { getAccountContext } from "@/lib/account-context";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { gatewayVisibilityClause, hasGatewayAccessLevel } from "@/lib/gateway-access";
import { hasRole } from "@/lib/rbac";
import {
  SUPPORTED_GATEWAY_CARRIERS,
  SUPPORTED_GATEWAY_HARDWARE,
  gatewayCarrierLabel,
  gatewayHardwareLabel
} from "@/lib/gateway-options";
import { effectiveGatewayStatus, gatewayStatusClass, gatewayStatusLabel } from "@/lib/gateway-status";

export default async function GatewaysPage() {
  const session = await requireAdminPage();
  const account = await getAccountContext(session);
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const canAdminGateways = hasRole(session, "org_admin");
  const gateways = await query(
    `SELECT g.id, g.name, g.status, g.last_heartbeat_at, g.hardware_type, g.software_version, g.carrier,
            g.api_key_prefix, g.visibility,
            CASE
              WHEN $2::boolean = true THEN 'manage'
              WHEN g.owner_organization_id = $1 THEN 'manage'
              WHEN g.organization_id = $1 AND g.visibility <> 'shared' THEN 'manage'
              ELSE COALESCE(ga.access_level, 'none')
            END AS access_level,
            h.metrics AS latest_metrics
       FROM gateways g
       LEFT JOIN gateway_access ga
         ON ga.gateway_id = g.id
        AND ga.organization_id = $1
       LEFT JOIN LATERAL (
         SELECT metrics
           FROM gateway_health
          WHERE gateway_id = g.id
          ORDER BY created_at DESC
         LIMIT 1
       ) h ON true
      WHERE ${gatewayVisibilityClause("g")}
      ORDER BY g.created_at DESC`
    , [organizationId, account.isPlatformAdmin]
  );
  const queueLanes = await query(
    `SELECT status,
            COUNT(*)::int AS count,
            MIN(created_at) AS oldest_created_at
       FROM messages
      WHERE organization_id = $1
        AND status IN ('queued', 'claimed', 'sending', 'retry_scheduled', 'dead_lettered')
      GROUP BY status`,
    [organizationId]
  );
  const activity = await query(
    `SELECT COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS messages_24h,
            COUNT(*) FILTER (WHERE status = 'carrier_submitted' AND created_at >= now() - interval '24 hours')::int AS submitted_24h
       FROM messages
      WHERE organization_id = $1`,
    [organizationId]
  );
  const lanesByStatus = new Map(queueLanes.rows.map((row: any) => [row.status, row]));
  const activeQueueCount = ["queued", "claimed", "sending", "retry_scheduled"]
    .reduce((sum, status) => sum + Number((lanesByStatus.get(status) as any)?.count || 0), 0);
  const messages24h = Number(activity.rows[0]?.messages_24h || 0);
  const submitted24h = Number(activity.rows[0]?.submitted_24h || 0);
  const deliverySuccess = messages24h ? `${Math.round((submitted24h / messages24h) * 1000) / 10}%` : "100%";
  const gatewayStatuses = gateways.rows.map((gateway: any) => effectiveGatewayStatus(gateway));
  const onlineCount = gatewayStatuses.filter((status: string) => status === "online").length;
  const staleCount = gatewayStatuses.filter((status: string) => status === "degraded").length;
  const unavailableCount = gatewayStatuses.filter((status: string) =>
    ["offline", "disabled", "maintenance"].includes(status)
  ).length;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Fleet Topology</h1>
          <p>Real-time view of SMS infrastructure and message flow</p>
        </div>
        <div className="actions-row">
          <span className="muted">Last updated: {new Date().toLocaleTimeString()}</span>
          <Link className="button secondary" href="/gateways"><RefreshCw size={16} />Auto-refresh</Link>
        </div>
      </header>

      <section className="metric-grid">
        <MetricCard label="Active Gateways" value={`${onlineCount} / ${gateways.rows.length}`} note="online" />
        <MetricCard label="Outbound Queue" value={activeQueueCount} note="pending" />
        <MetricCard label="Messages (24h)" value={messages24h} note={`${submitted24h} submitted`} />
        <MetricCard label="Delivery Success" value={deliverySuccess} note="24h" />
      </section>

      <section className="panel">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <div>
            <h2>Infrastructure Topology</h2>
            <p className="muted">Clients route through pools, gateways, and the carrier network.</p>
          </div>
          {account.isPlatformAdmin ? <Link className="button secondary" href="/routing">View routing pools</Link> : null}
        </div>
        <div className="topology-canvas" style={{ marginBottom: 18 }}>
          <div className="topology-node">
            <div className="topology-label">Clients</div>
            <strong>M.A.T.T.</strong>
            <div className="object-meta">Dashboard/API sources</div>
          </div>
          <div className="topology-node">
            <div className="topology-label">Pools</div>
            <strong>Global Pool</strong>
            <div className="object-meta">{gateways.rows.length} gateways</div>
          </div>
          <div className="topology-node">
            <div className="topology-label">Gateways</div>
            <strong>{onlineCount} online</strong>
            <div className="object-meta">{staleCount} stale heartbeat</div>
          </div>
          <div className="topology-node">
            <div className="topology-label">Carrier</div>
            <strong>Tello / SMS</strong>
            <div className="object-meta">LTE Cat-M network</div>
          </div>
        </div>
        <table className="table desktop-only">
          <thead>
            <tr>
              <th>Status</th>
              <th>Gateway</th>
              <th>Heartbeat</th>
              <th>Signal</th>
              <th>Hardware</th>
              <th>Version</th>
              <th>Key</th>
            </tr>
          </thead>
          <tbody>
            {gateways.rows.map((gateway: any) => (
              <tr key={gateway.id}>
                <td>
                  <span className={`status ${gatewayStatusClass(effectiveGatewayStatus(gateway))}`}>
                    {gatewayStatusLabel(effectiveGatewayStatus(gateway))}
                  </span>
                </td>
                <td>
                  {hasGatewayAccessLevel(gateway.access_level, "details") ? (
                    <Link href={`/gateways/${gateway.id}`}><strong>{gateway.name}</strong></Link>
                  ) : (
                    <strong>{gateway.name}</strong>
                  )}
                  <div className="object-meta">{gatewayCarrierLabel(gateway.carrier)}</div>
                </td>
                <td>{gateway.last_heartbeat_at ? new Date(gateway.last_heartbeat_at).toLocaleString() : "-"}</td>
                <td>
                  <div className="relationship-row">
                    <SignalBars />
                    <span>{formatSignal(gateway.latest_metrics?.signalQuality)}</span>
                  </div>
                </td>
                <td>{gatewayHardwareLabel(gateway.hardware_type)}</td>
                <td>{gateway.software_version || "Unknown"}</td>
                <td>{hasGatewayAccessLevel(gateway.access_level, "manage") ? `${gateway.api_key_prefix}...` : "Shared"}</td>
              </tr>
            ))}
            {!gateways.rows.length ? <tr><td colSpan={7}>No gateways yet.</td></tr> : null}
          </tbody>
        </table>
        <div className="mobile-only mobile-card-list">
          {gateways.rows.map((gateway: any) => (
            <Link className="mobile-card" href={hasGatewayAccessLevel(gateway.access_level, "details") ? `/gateways/${gateway.id}` : "/gateways"} key={gateway.id}>
              <div className="mobile-card-main">
                <div>
                  <div className="mobile-card-title">{gateway.name}</div>
                  <div className="mobile-card-body">{gatewayHardwareLabel(gateway.hardware_type)} · {gatewayCarrierLabel(gateway.carrier)} · v{gateway.software_version || "unknown"}</div>
                </div>
                <span className={`status ${gatewayStatusClass(effectiveGatewayStatus(gateway))}`}>
                  {gatewayStatusLabel(effectiveGatewayStatus(gateway))}
                </span>
              </div>
              <div className="mobile-card-meta">
                <span>Heartbeat: {gateway.last_heartbeat_at ? new Date(gateway.last_heartbeat_at).toLocaleString() : "-"}</span>
                <span>Signal: {formatSignal(gateway.latest_metrics?.signalQuality)}</span>
              </div>
            </Link>
          ))}
          {!gateways.rows.length ? <p className="muted">No gateways yet.</p> : null}
        </div>
      </section>

      <div className="grid" style={{ marginTop: 16 }}>
        <section className="panel">
          <h2>Message Queue Lanes</h2>
          <table className="table">
            <thead><tr><th>Status</th><th>Count</th><th>Oldest Message</th></tr></thead>
            <tbody>
              <QueueLane label="Queued" status="queued" row={lanesByStatus.get("queued")} />
              <QueueLane label="Claimed" status="claimed" row={lanesByStatus.get("claimed")} />
              <QueueLane label="Sending" status="sending" row={lanesByStatus.get("sending")} />
              <QueueLane label="Retry Scheduled" status="retry_scheduled" row={lanesByStatus.get("retry_scheduled")} />
              <QueueLane label="Dead Letter" status="dead_lettered" row={lanesByStatus.get("dead_lettered")} />
            </tbody>
          </table>
        </section>
        {canAdminGateways ? (
          <section className="panel">
            <h2>Provision gateway</h2>
            <form className="form" action={createGatewayAction}>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required placeholder="RelayHub Edge 01" />
            </div>
            <div className="field">
              <label htmlFor="hardwareType">Hardware</label>
              <select id="hardwareType" name="hardwareType" defaultValue={SUPPORTED_GATEWAY_HARDWARE[0].value}>
                {SUPPORTED_GATEWAY_HARDWARE.map((hardware) => (
                  <option key={hardware.value} value={hardware.value}>{hardware.label}</option>
                ))}
              </select>
              <p className="muted">{SUPPORTED_GATEWAY_HARDWARE[0].description}</p>
            </div>
            <div className="field">
              <label htmlFor="carrier">Carrier</label>
              <select id="carrier" name="carrier" defaultValue={SUPPORTED_GATEWAY_CARRIERS[0].value}>
                {SUPPORTED_GATEWAY_CARRIERS.map((carrier) => (
                  <option key={carrier.value} value={carrier.value}>{carrier.label} ({carrier.network})</option>
                ))}
              </select>
            </div>
            {account.isPlatformAdmin ? (
              <div className="field">
                <label htmlFor="visibility">Ownership</label>
                <select id="visibility" name="visibility" defaultValue="shared">
                  <option value="shared">Shared platform gateway</option>
                  <option value="client_owned">Client-owned gateway</option>
                </select>
              </div>
            ) : (
              <input type="hidden" name="visibility" value="client_owned" />
            )}
            <button className="primary" type="submit"><Plus size={16} />Create gateway</button>
            </form>
          </section>
        ) : null}
        {account.isPlatformAdmin ? (
          <section className="panel">
            <h2>Installer</h2>
            <pre>curl https://sns.digicolony.net/install | sudo bash</pre>
            <p className="muted">Create a gateway first to receive the API key, then run the installer on the appliance.</p>
          </section>
        ) : null}
      </div>
    </>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <div className="metric-value">{value}</div>
      <div className="metric-delta"><RadioTower size={12} />{note}</div>
    </div>
  );
}

function SignalBars() {
  return (
    <span className="signal-bars" aria-hidden="true">
      {[12, 18, 24, 30].map((height) => <span key={height} style={{ height }} />)}
    </span>
  );
}

function formatSignal(signal: any) {
  if (!signal) return "No signal report";
  const label = signal.label || humanize(signal.level || "unknown");
  return signal.rssiDbm ? `${label} (${signal.rssiDbm} dBm)` : label;
}

function QueueLane({ label, status, row }: { label: string; status: string; row?: any }) {
  const count = Number(row?.count || 0);
  const oldest = row?.oldest_created_at ? new Date(row.oldest_created_at).toLocaleString() : "-";
  const chipClass = status === "dead_lettered" ? "chip bad" : status === "retry_scheduled" ? "chip warn" : "chip";
  return (
    <tr>
      <td><span className={chipClass}>{label}</span></td>
      <td>{count}</td>
      <td>{oldest}</td>
    </tr>
  );
}
