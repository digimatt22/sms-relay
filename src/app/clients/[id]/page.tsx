import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, KeyRound, Plus, Send, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { createApiClientKeyAction, updateApiClientLimitsAction } from "@/app/actions";
import { LocalDateTime } from "@/components/local-date-time";
import { query } from "@/lib/db";
import { humanize } from "@/lib/format";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { requireAdminPage } from "@/lib/page-auth";
import { hasRole } from "@/lib/rbac";
import { getPlatformName } from "@/lib/branding";

export default async function ClientWorkspacePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ apiKey?: string; error?: string }>;
}) {
  const session = await requireAdminPage();
  const { id } = await params;
  const sp = await searchParams;
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const canAdminClients = hasRole(session, "org_admin");
  const platformName = getPlatformName();

  const [clientResult, messages, inbound, callbacks, pools, keys] = await Promise.all([
    query(
      `SELECT c.*,
              COUNT(m.id)::int AS total_messages,
              COUNT(m.id) FILTER (WHERE m.created_at >= now() - interval '24 hours')::int AS messages_24h,
              COUNT(m.id) FILTER (WHERE m.status = 'carrier_submitted')::int AS submitted_messages,
              COUNT(m.id) FILTER (WHERE m.status IN ('retry_scheduled', 'failed', 'dead_lettered'))::int AS problem_messages
         FROM api_clients c
         LEFT JOIN messages m ON m.api_client_id = c.id
        WHERE c.id = $1 AND c.organization_id = $2
        GROUP BY c.id`,
      [id, organizationId]
    ),
    query(
      `SELECT m.*, g.name AS gateway_name
         FROM messages m
         LEFT JOIN gateways g ON g.id = m.claim_gateway_id
        WHERE m.api_client_id = $1
          AND m.organization_id = $2
        ORDER BY m.created_at DESC
        LIMIT 20`,
      [id, organizationId]
    ),
    query(
      `SELECT i.*, m.id AS outbound_id
         FROM inbound_messages i
         JOIN messages m ON m.id = i.matched_message_id
        WHERE m.api_client_id = $1
          AND i.organization_id = $2
        ORDER BY i.received_at DESC
        LIMIT 10`,
      [id, organizationId]
    ),
    query(
      `SELECT *
         FROM callback_deliveries
        WHERE organization_id = $2
          AND (
            message_id IN (SELECT id FROM messages WHERE api_client_id = $1)
            OR inbound_message_id IN (
              SELECT i.id
                FROM inbound_messages i
                JOIN messages m ON m.id = i.matched_message_id
               WHERE m.api_client_id = $1
            )
          )
        ORDER BY created_at DESC
        LIMIT 10`,
      [id, organizationId]
    ),
    query(
      `SELECT p.*, a.is_default,
              COALESCE(
                json_agg(jsonb_build_object('id', g.id, 'name', g.name, 'status', g.status))
                  FILTER (WHERE g.id IS NOT NULL),
                '[]'
              ) AS gateways
         FROM api_client_gateway_pool_access a
         JOIN gateway_pools p ON p.id = a.gateway_pool_id
         LEFT JOIN gateway_pool_memberships gm ON gm.gateway_pool_id = p.id
         LEFT JOIN gateways g ON g.id = gm.gateway_id
        WHERE a.api_client_id = $1
          AND p.organization_id = $2
        GROUP BY p.id, a.is_default
        ORDER BY a.is_default DESC, p.name ASC`,
      [id, organizationId]
    ),
    query(
      `SELECT id, label, api_key_prefix, status, last_used_at, created_at, revoked_at,
              COUNT(*) OVER (PARTITION BY status)::int AS status_count
         FROM api_client_keys
        WHERE api_client_id = $1
        ORDER BY status ASC, created_at DESC`,
      [id]
    )
  ]);

  const client = clientResult.rows[0];
  if (!client) notFound();
  const activeKeys = keys.rows.filter((row: any) => row.status === "active").length;
  const revokedKeys = keys.rows.filter((row: any) => row.status === "revoked").length;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{client.name}</h1>
          <p>API app under this client account. Keys, routing, callbacks, and usage live here.</p>
        </div>
        <div className="actions-row">
          <span className={`status ${client.status}`}>{humanize(client.status)}</span>
          <Link className="button secondary" href="/clients">All clients</Link>
        </div>
      </header>

      {sp.apiKey ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>One-time API key</h2>
          <p className="muted">Store this value now. It will not be shown again.</p>
          <pre>{sp.apiKey}</pre>
        </section>
      ) : null}

      {sp.error ? (
        <section className="panel error" style={{ marginBottom: 16 }}>
          <p>{sp.error}</p>
        </section>
      ) : null}

      <div className="tabs" aria-label="Client workspace sections">
        <a className="tab active" href="#overview">Overview</a>
        <a className="tab" href="#messages">Messages</a>
        <a className="tab" href="#replies">Replies</a>
        <a className="tab" href="#routing">Routing</a>
        <a className="tab" href="#callbacks">Callbacks</a>
        <a className="tab" href="#keys">Keys & limits</a>
      </div>

      <section className="metric-grid" id="overview">
        <MetricCard label="24h messages" value={client.messages_24h || 0} note="Outbound submitted by this client" />
        <MetricCard label="Carrier submitted" value={client.submitted_messages || 0} note="All-time successful submissions" />
        <MetricCard label="Problems" value={client.problem_messages || 0} note="Retries, failures, or dead letters" />
        <MetricCard label="Active keys" value={activeKeys} note={`${revokedKeys} revoked keys retained for audit`} />
      </section>

      <div className="split-layout">
        <div className="section-stack">
          <section className="panel" id="messages">
            <h2>Recent messages</h2>
            <table className="table desktop-only">
              <thead><tr><th>Status</th><th>Recipient</th><th>Gateway</th><th>Attempts</th><th>Created</th></tr></thead>
              <tbody>
                {messages.rows.map((message: any) => (
                  <tr key={message.id}>
                    <td><span className={`status ${message.status}`}>{humanize(message.status)}</span></td>
                    <td><Link href={`/messages/${message.id}`}>{message.to_number_redacted}</Link></td>
                    <td>{message.gateway_name || "-"}</td>
                    <td>{message.attempt_count}</td>
                    <td><LocalDateTime value={message.created_at} /></td>
                  </tr>
                ))}
                {!messages.rows.length ? <tr><td colSpan={5}>No messages from this client yet.</td></tr> : null}
              </tbody>
            </table>
            <div className="mobile-only mobile-card-list">
              {messages.rows.map((message: any) => (
                <Link className="mobile-card" href={`/messages/${message.id}`} key={message.id}>
                  <div className="mobile-card-main">
                    <div>
                      <div className="mobile-card-title">{message.to_number_redacted}</div>
                      <div className="mobile-card-body">{message.body}</div>
                    </div>
                    <span className={`status ${message.status}`}>{humanize(message.status)}</span>
                  </div>
                  <div className="mobile-card-meta">
                    <span>Gateway: {message.gateway_name || "-"}</span>
                    <span>Attempts: {message.attempt_count}</span>
                    <span><LocalDateTime value={message.created_at} /></span>
                  </div>
                </Link>
              ))}
              {!messages.rows.length ? <p className="muted">No messages from this client yet.</p> : null}
            </div>
          </section>

          <section className="panel" id="replies">
            <h2>Matched replies</h2>
            <table className="table">
              <thead><tr><th>From</th><th>Reply</th><th>Outbound</th><th>Callback</th><th>Received</th></tr></thead>
              <tbody>
                {inbound.rows.map((reply: any) => (
                  <tr key={reply.id}>
                    <td><Link href={`/inbox/${reply.id}`}>{reply.from_number_redacted}</Link></td>
                    <td>{reply.body}</td>
                    <td><Link href={`/messages/${reply.outbound_id}`}>{reply.outbound_id}</Link></td>
                    <td><span className={`status ${reply.callback_status}`}>{humanize(reply.callback_status)}</span></td>
                    <td><LocalDateTime value={reply.received_at} /></td>
                  </tr>
                ))}
                {!inbound.rows.length ? <tr><td colSpan={5}>No matched replies yet.</td></tr> : null}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="section-stack">
          <section className="panel">
            <h2>Send test message</h2>
            <form className="form">
              <div className="field">
                <label htmlFor="test-to">To (E.164)</label>
                <input id="test-to" placeholder="+1 555 123 4567" />
              </div>
              <div className="field">
                <label htmlFor="test-message">Message</label>
                <textarea id="test-message" placeholder={`Hello from ${platformName}...`} rows={4} />
              </div>
              <div className="actions-row" style={{ justifyContent: "space-between" }}>
                <Link className="button secondary" href="/messages/new">Open composer</Link>
                <Link className="button" href="/messages/new"><Send size={16} />Send now</Link>
              </div>
            </form>
          </section>

          <section className="panel">
            <h2>Integration health</h2>
            <div className="object-list">
              <HealthRow label="API Key" detail={client.last_used_at ? <>Last used <LocalDateTime value={client.last_used_at} /></> : "Ready"} />
              <HealthRow label="Gateway access" detail={`${pools.rows.length} pools assigned`} />
              <HealthRow label="Callback endpoint" detail={callbacks.rows.length ? "Deliveries observed" : "Not configured"} />
              <HealthRow label="Limits" detail="Within thresholds" />
            </div>
            <Link className="button secondary" href="#keys" style={{ marginTop: 14, width: "100%" }}><ShieldCheck size={16} />View full health</Link>
          </section>

          <section className="panel" id="routing">
            <h2>Routing ownership</h2>
            <div className="object-list">
              {pools.rows.map((pool: any) => (
                <div className="object-row" key={pool.id}>
                  <div>
                    <div className="object-title">{pool.name}</div>
                    <div className="object-meta">{pool.gateways.map((gateway: any) => gateway.name).join(", ") || "No gateways"}</div>
                  </div>
                  {pool.is_default ? <span className="chip good">Default</span> : <span className="chip">Allowed</span>}
                </div>
              ))}
              {!pools.rows.length ? <p className="muted">No gateway pools assigned.</p> : null}
            </div>
          </section>

          <section className="panel" id="callbacks">
            <h2>Callback health</h2>
            <div className="object-list">
              {callbacks.rows.map((callback: any) => (
                <div className="object-row" key={callback.id}>
                  <div>
                    <div className="object-title">{humanize(callback.event_type)}</div>
                    <div className="object-meta">{callback.callback_url}</div>
                  </div>
                  <span className={`status ${callback.status}`}>{humanize(callback.status)}</span>
                </div>
              ))}
              {!callbacks.rows.length ? <p className="muted">No callback deliveries for this client yet.</p> : null}
            </div>
          </section>

          <section className="panel" id="keys">
            <h2>API keys & limits</h2>
            <div className="object-list" style={{ marginBottom: 14 }}>
              {keys.rows.map((key: any) => (
                <div className="object-row" key={key.id}>
                  <div>
                    <div className="relationship-row">
                      <KeyRound size={16} />
                      <strong>{key.label || "Unnamed key"}</strong>
                      <span className={`status ${key.status}`}>{humanize(key.status)}</span>
                    </div>
                    <div className="object-meta">{key.api_key_prefix}... · Last used {key.last_used_at ? <LocalDateTime value={key.last_used_at} /> : "never"}</div>
                  </div>
                </div>
              ))}
            </div>
            {canAdminClients ? (
              <form className="form" action={createApiClientKeyAction} style={{ marginBottom: 16 }}>
                <input type="hidden" name="clientId" value={client.id} />
                <div className="field">
                  <label htmlFor="label">New key name</label>
                  <input id="label" name="label" required placeholder="Production CRM, Staging, Support console" />
                </div>
                <button className="secondary-button" type="submit"><Plus size={16} />Create named key</button>
              </form>
            ) : null}
            <dl>
              <dt>Last used</dt>
              <dd>{client.last_used_at ? <LocalDateTime value={client.last_used_at} /> : "-"}</dd>
            </dl>
            {canAdminClients ? (
              <form className="form" action={updateApiClientLimitsAction}>
                <input type="hidden" name="clientId" value={client.id} />
                <div className="field">
                  <label htmlFor="hourlyMessageLimit">Hourly message limit</label>
                  <input id="hourlyMessageLimit" name="hourlyMessageLimit" type="number" min="1" defaultValue={client.hourly_message_limit || ""} />
                </div>
                <div className="field">
                  <label htmlFor="dailyMessageLimit">Daily message limit</label>
                  <input id="dailyMessageLimit" name="dailyMessageLimit" type="number" min="1" defaultValue={client.daily_message_limit || ""} />
                </div>
                <button className="primary" type="submit">Save limits</button>
              </form>
            ) : null}
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

function HealthRow({ label, detail }: { label: string; detail: ReactNode }) {
  return (
    <div className="object-row">
      <div className="relationship-row">
        <CheckCircle2 size={17} color="#009688" />
        <strong>{label}</strong>
      </div>
      <span className="object-meta">{detail}</span>
    </div>
  );
}
