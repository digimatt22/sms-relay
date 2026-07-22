import { notFound } from "next/navigation";
import Link from "next/link";
import { Activity, Download, Power, RadioTower, RotateCcw, Save, Wrench } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import { requireAdminPage } from "@/lib/page-auth";
import { query } from "@/lib/db";
import { humanize } from "@/lib/format";
import { accountHasRole, getAccountContext } from "@/lib/account-context";
import { getGatewayAccessLevel, hasGatewayAccessLevel } from "@/lib/gateway-access";
import {
  enableGatewayAction,
  markGatewayMaintenanceAction,
  requestGatewayCommandAction,
  updateGatewayAction
} from "@/app/actions";
import {
  SUPPORTED_GATEWAY_CARRIERS,
  SUPPORTED_GATEWAY_HARDWARE,
  gatewayCarrierLabel,
  gatewayHardwareLabel
} from "@/lib/gateway-options";
import { effectiveGatewayStatus, gatewayStatusClass, gatewayStatusLabel } from "@/lib/gateway-status";

export default async function GatewayDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ apiKey?: string }>;
}) {
  const session = await requireAdminPage();
  const account = await getAccountContext(session);
  const { id } = await params;
  const sp = await searchParams;
  const accessLevel = await getGatewayAccessLevel({
    gatewayId: id,
    organizationId: account.organizationId,
    isPlatformAdmin: account.isPlatformAdmin
  });
  if (!hasGatewayAccessLevel(accessLevel, "details")) notFound();
  const canOperate = accountHasRole(account, "operator") && hasGatewayAccessLevel(accessLevel, "manage");
  const gateway = await query<any>("SELECT * FROM gateways WHERE id = $1", [id]);
  if (!gateway.rows[0]) notFound();
  const logs = await query<any>("SELECT * FROM gateway_logs WHERE gateway_id = $1 ORDER BY created_at DESC LIMIT 50", [id]);
  const health = await query<any>("SELECT * FROM gateway_health WHERE gateway_id = $1 ORDER BY created_at DESC LIMIT 20", [id]);
  const commands = await query<any>(
    "SELECT * FROM gateway_commands WHERE gateway_id = $1 ORDER BY requested_at DESC LIMIT 20",
    [id]
  );
  const latestSignal = health.rows[0]?.metrics?.signalQuality;
  const recentErrors = logs.rows.filter((log: any) => log.level === "error").length;
  const lastCommand = commands.rows[0];
  const effectiveStatus = effectiveGatewayStatus(gateway.rows[0]);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="muted"><Link href="/gateways">Back to Gateways</Link></p>
          <h1>{gateway.rows[0].name}</h1>
          <p>{gatewayHardwareLabel(gateway.rows[0].hardware_type)} · SIM7070G · {gatewayCarrierLabel(gateway.rows[0].carrier)}</p>
        </div>
        <div className="actions-row">
          <span className={`status ${gatewayStatusClass(effectiveStatus)}`}>{gatewayStatusLabel(effectiveStatus)}</span>
          {canOperate ? (
            <>
              <form action={requestGatewayCommandAction}>
                <input type="hidden" name="gatewayId" value={gateway.rows[0].id} />
                <input type="hidden" name="commandType" value="update_service" />
                <button className="secondary-button" type="submit"><Download size={16} />Update gateway</button>
              </form>
              <form action={requestGatewayCommandAction}>
                <input type="hidden" name="gatewayId" value={gateway.rows[0].id} />
                <input type="hidden" name="commandType" value="restart_service" />
                <button className="secondary-button" type="submit"><RotateCcw size={16} />Restart service</button>
              </form>
              <form action={requestGatewayCommandAction}>
                <input type="hidden" name="gatewayId" value={gateway.rows[0].id} />
                <input type="hidden" name="commandType" value="reset_modem" />
                <button className="secondary-button danger" type="submit"><Power size={16} />Reset modem</button>
              </form>
            </>
          ) : null}
        </div>
      </header>
      {sp.apiKey ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>One-time API key</h2>
          <p className="muted">Store this on the appliance. It will not be shown again.</p>
          <pre>{sp.apiKey}</pre>
        </section>
      ) : null}
      <section className="metric-grid">
        <MetricCard label="Signal Quality" value={latestSignal?.label || "No report"} note={latestSignal?.rssiDbm ? `${latestSignal.rssiDbm} dBm` : "No current health sample"} kind="signal" />
        <MetricCard label="Network" value="Registered" note={health.rows[0]?.metrics?.networkMode || "LTE Cat-M"} />
        <MetricCard label="Recent errors" value={recentErrors} note="latest 50 logs" />
        <MetricCard label="Last command" value={lastCommand ? humanize(lastCommand.status) : "None"} note={lastCommand ? humanize(lastCommand.command_type) : "No command requested"} />
      </section>
      <div className="route-card-grid">
        <section className="panel">
          <h2>Hardware Status</h2>
          <dl>
            <dt>Hardware</dt><dd>{gatewayHardwareLabel(gateway.rows[0].hardware_type)}</dd>
            <dt>Software</dt><dd>{gateway.rows[0].software_version || "Unknown"}</dd>
            <dt>Carrier</dt><dd>{gatewayCarrierLabel(gateway.rows[0].carrier)}</dd>
            <dt>Serial Device</dt><dd>{health.rows[0]?.metrics?.serialDevice || "/dev/serial0"}</dd>
            <dt>Baud Rate</dt><dd>{health.rows[0]?.metrics?.serialBaudRate || "115200"}</dd>
            <dt>Last heartbeat</dt><dd>{gateway.rows[0].last_heartbeat_at ? <LocalDateTime value={gateway.rows[0].last_heartbeat_at} /> : "-"}</dd>
          </dl>
          {canOperate ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <form action={markGatewayMaintenanceAction}>
                <input type="hidden" name="gatewayId" value={gateway.rows[0].id} />
                <button className="secondary-button" type="submit"><Wrench size={16} />Maintenance</button>
              </form>
              <form action={enableGatewayAction}>
                <input type="hidden" name="gatewayId" value={gateway.rows[0].id} />
                <button className="secondary-button" type="submit"><Activity size={16} />Enable</button>
              </form>
            </div>
          ) : null}
        </section>
        <section className="panel">
          <h2>Modem & Network</h2>
          <div className="relationship-row" style={{ marginBottom: 16 }}>
            <SignalBars />
            <strong>{formatSignal(latestSignal)}</strong>
          </div>
          <dl>
            <dt>Model</dt><dd>{health.rows[0]?.metrics?.modemMode || "SIM7070G"}</dd>
            <dt>Registration</dt><dd>{health.rows[0]?.metrics?.registration || "Registered"}</dd>
            <dt>Operator</dt><dd>{gatewayCarrierLabel(gateway.rows[0].carrier || "Tello")}</dd>
            <dt>RSRP</dt><dd>{latestSignal?.rssiDbm ? `${latestSignal.rssiDbm} dBm` : "-"}</dd>
          </dl>
          <div className="relationship-row" style={{ marginBottom: 12 }}>
            <span className="chip">{health.rows[0]?.metrics?.modemMode || "unknown modem"}</span>
            <span className="chip">{health.rows[0]?.metrics?.serialDevice || "unknown serial"}</span>
            <span className="chip">{health.rows[0]?.metrics?.serialBaudRate || "unknown baud"}</span>
          </div>
          <details className="diagnostic-details">
            <summary>Raw modem diagnostics</summary>
            <pre>{JSON.stringify(health.rows[0]?.metrics || {}, null, 2)}</pre>
          </details>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Commands</h2>
        {canOperate ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {[
              ["diagnostics", "Diagnostics"],
              ["reset_modem", "Reset modem"],
              ["restart_service", "Restart service"],
              ["update_service", "Update gateway"]
            ].map(([commandType, label]) => (
              <form key={commandType} action={requestGatewayCommandAction}>
                <input type="hidden" name="gatewayId" value={gateway.rows[0].id} />
                <input type="hidden" name="commandType" value={commandType} />
                <button className="secondary-button" type="submit">{label}</button>
              </form>
            ))}
          </div>
        ) : null}
        <table className="table">
          <thead><tr><th>Requested</th><th>Command</th><th>Status</th><th>Result</th></tr></thead>
          <tbody>
            {commands.rows.map((command: any) => (
              <tr key={command.id}>
                <td><LocalDateTime value={command.requested_at} /></td>
                <td>{humanize(command.command_type)}</td>
                <td><span className={`status ${command.status}`}>{humanize(command.status)}</span></td>
                <td>{command.result ? <pre>{JSON.stringify(command.result, null, 2)}</pre> : "-"}</td>
              </tr>
            ))}
            {!commands.rows.length ? <tr><td colSpan={4}>No commands requested yet.</td></tr> : null}
          </tbody>
        </table>
      </section>
      {canOperate ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <h2>Edit gateway</h2>
          <form className="form" action={updateGatewayAction}>
            <input type="hidden" name="gatewayId" value={gateway.rows[0].id} />
            <div className="grid">
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" name="name" required defaultValue={gateway.rows[0].name} />
              </div>
              <div className="field">
                <label htmlFor="hardwareType">Hardware</label>
                <select id="hardwareType" name="hardwareType" defaultValue={gatewayHardwareLabel(gateway.rows[0].hardware_type)}>
                  {SUPPORTED_GATEWAY_HARDWARE.map((hardware) => (
                    <option key={hardware.value} value={hardware.value}>{hardware.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="carrier">Carrier</label>
                <select id="carrier" name="carrier" defaultValue={gateway.rows[0].carrier || SUPPORTED_GATEWAY_CARRIERS[0].value}>
                  {SUPPORTED_GATEWAY_CARRIERS.map((carrier) => (
                    <option key={carrier.value} value={carrier.value}>{carrier.label} ({carrier.network})</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="location">Location</label>
                <input id="location" name="location" defaultValue={gateway.rows[0].location || ""} />
              </div>
              <div className="field">
                <label htmlFor="routingWeight">Routing weight</label>
                <input id="routingWeight" name="routingWeight" type="number" min="1" max="10000" defaultValue={gateway.rows[0].routing_weight || 100} />
              </div>
              <div className="field">
                <label htmlFor="hourlySendLimit">Hourly send cap</label>
                <input id="hourlySendLimit" name="hourlySendLimit" type="number" min="1" max="100000" defaultValue={gateway.rows[0].hourly_send_limit || ""} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="notes">Notes</label>
              <textarea id="notes" name="notes" rows={4} defaultValue={gateway.rows[0].notes || ""} />
            </div>
            <button className="primary" type="submit"><Save size={16} />Save gateway</button>
          </form>
        </section>
      ) : null}
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Recent logs</h2>
        <div className="log-scroll">
          <table className="table">
            <thead><tr><th>Level</th><th>Event</th><th>Message</th><th>Time</th></tr></thead>
            <tbody>
              {logs.rows.map((log: any) => (
                <tr key={log.id}>
                  <td>{log.level}</td>
                  <td>{humanize(log.event_type)}</td>
                  <td>{log.message}</td>
                  <td><LocalDateTime value={log.created_at} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function formatSignal(signal: any) {
  if (!signal) return "No signal report";
  const label = signal.label || humanize(signal.level || "unknown");
  return signal.rssiDbm ? `${label} (${signal.rssiDbm} dBm)` : label;
}

function MetricCard({ label, value, note, kind }: { label: string; value: string | number; note: string; kind?: "signal" }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <div className="relationship-row" style={{ justifyContent: "space-between" }}>
        <div className="metric-value">{value}</div>
        {kind === "signal" ? <SignalBars /> : <RadioTower size={28} color="#0f766e" />}
      </div>
      <div className="metric-note">{note}</div>
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
