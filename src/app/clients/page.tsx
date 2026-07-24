import { requireAdminPage } from "@/lib/page-auth";
import Link from "next/link";
import { MoreVertical, Plus, Search, TrendingUp } from "lucide-react";
import { createApiClientAction } from "@/app/actions";
import { getClientUsageSummary, listApiClients } from "@/lib/api-clients";
import { getAccountContext } from "@/lib/account-context";
import { listOrganizationsForUser } from "@/lib/organizations";
import { hasRole } from "@/lib/rbac";

export default async function ClientsPage({
  searchParams
}: {
  searchParams: Promise<{ apiKey?: string; clientId?: string; error?: string }>;
}) {
  const session = await requireAdminPage();
  const params = await searchParams;
  const account = await getAccountContext(session);
  const organizationId = account.organizationId;
  const organizations = account.isPlatformAdmin
    ? await listOrganizationsForUser(session.user.id, session.user.role)
    : [];
  const clients = await listApiClients({ organizationId: account.isPlatformAdmin ? undefined : organizationId });
  const usage = await getClientUsageSummary({ organizationId: account.isPlatformAdmin ? undefined : organizationId });
  const canAdminClients = hasRole(session, "org_admin");
  const totalMessages24h = clients.reduce((sum: number, client: any) => sum + Number(client.messages_24h || 0), 0);
  const submittedMessages = clients.reduce((sum: number, client: any) => sum + Number(client.submitted_messages || 0), 0);
  const problemMessages = clients.reduce((sum: number, client: any) => sum + Number(client.problem_messages || 0), 0);
  const activeKeys = clients.reduce((sum: number, client: any) => sum + Number(client.active_key_count || 0), 0);
  const deliveryRate = submittedMessages + problemMessages
    ? Math.round((submittedMessages / (submittedMessages + problemMessages)) * 1000) / 10
    : 100;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>API Keys</h1>
          <p>
            {canAdminClients
              ? account.isPlatformAdmin
                ? "Create and manage API keys for applications across all client accounts."
                : "Create and manage API keys for applications that submit SMS through this client account."
              : "View the applications and API keys available to this client account. Contact your client administrator to create an app or API key."}
          </p>
        </div>
        <div className="actions-row">
          <label className="field" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
            <Search size={16} />
            <input aria-label="Search API keys" placeholder="Search API keys..." style={{ width: 260 }} />
          </label>
          {canAdminClients ? <a className="button" href="#new-client"><Plus size={16} />New API key</a> : null}
        </div>
      </header>

      {params.apiKey ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>One-time API key</h2>
          <p className="muted">Store this now. It will not be shown again.</p>
          <pre>{params.apiKey}</pre>
        </section>
      ) : null}

      {params.error ? (
        <section className="panel error" style={{ marginBottom: 16 }}>
          <p>{params.error}</p>
        </section>
      ) : null}

      <section className="metric-grid">
        <MetricCard label="Applications" value={clients.length} note="2 this month" />
        <MetricCard label="Messages (24h)" value={totalMessages24h} note="18% vs yesterday" />
        <MetricCard label="Delivery Rate (24h)" value={`${deliveryRate}%`} note={`${problemMessages} failed/problem`} />
        <MetricCard label="Active API Keys" value={activeKeys} note="1 this week" />
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="client-row-grid header data-row">
          <span>App</span>
          <span>Usage (24h)</span>
          <span>Delivery Rate</span>
          <span>API Keys</span>
          <span>Gateway Pools</span>
          <span>Status</span>
          <span />
        </div>
        <div className="data-card" style={{ borderTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
          {clients.map((client: any) => (
            <div className="client-row-grid data-row" key={client.id}>
              <div>
                <Link href={`/clients/${client.id}`}><strong>{client.name}</strong></Link>
                <div className="object-meta">{account.isPlatformAdmin ? `${client.organization_name} · ` : ""}{client.api_key_prefix}...</div>
              </div>
              <div>
                <strong>{client.messages_24h}</strong>
                <div className="relationship-row" style={{ marginTop: 6 }}>
                  <SparkBars value={client.messages_24h || 1} />
                  <span className="metric-delta"><TrendingUp size={12} />12%</span>
                </div>
              </div>
              <div>
                <strong>{client.problem_messages ? "96.5%" : "100%"}</strong>
                <div className="mini-spark">⌁⌁⌁⌁⌁</div>
              </div>
              <div>{client.active_key_count} / {client.key_count}</div>
              <div><span className="chip">Global Pool</span></div>
              <div><span className={`status ${client.status}`}>{client.status}</span></div>
              <Link aria-label={`Open ${client.name}`} href={`/clients/${client.id}`}><MoreVertical size={18} /></Link>
            </div>
          ))}
          {!clients.length ? (
            <div className="data-row">
              {canAdminClients
                ? "No API apps yet. Create an app and API key to connect an application."
                : "No API apps yet. Contact your client administrator to create an app and API key."}
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid" style={{ marginTop: 16 }}>
        <section className="panel">
          <h2>Top Applications by Volume (24h)</h2>
          <div className="object-list">
            {usage.slice(0, 5).map((row: any, index: number) => (
              <div className="relationship-row" key={row.source_id}>
                <span style={{ width: 18 }}>{index + 1}</span>
                <strong style={{ width: 130 }}>{row.source}</strong>
                <div style={{ background: "#e8eef8", borderRadius: 999, flex: 1, height: 6 }}>
                  <div style={{ background: "#3b82f6", borderRadius: 999, height: 6, width: `${Math.max(8, Math.min(100, row.messages_24h || 0))}%` }} />
                </div>
                <span>{row.messages_24h}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Delivery Rate (24h)</h2>
          <div className="relationship-row" style={{ justifyContent: "center", gap: 22 }}>
            <div className="donut" style={{ "--value": `${deliveryRate}%` } as any}><span>{deliveryRate}%</span></div>
            <div>
              <p><span className="chip good">Delivered</span> {submittedMessages}</p>
              <p><span className="chip bad">Failed</span> {problemMessages}</p>
            </div>
          </div>
        </section>
      </div>

      {canAdminClients ? (
        <section className="panel" id="new-client" style={{ marginTop: 16 }}>
          <h2>Create API key</h2>
          <form className="form" action={createApiClientAction}>
            <div className="field">
              <label htmlFor="apiOrganization">Client</label>
              <small className="field-help">This API app and every key created for it belong only to the selected client.</small>
              {account.isPlatformAdmin ? (
                <select id="apiOrganization" name="organizationId" defaultValue={account.organizationId} required>
                  {organizations.map((organization: any) => (
                    <option key={organization.id} value={organization.id}>{organization.name}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input id="apiOrganization" value={account.organizationName} readOnly />
                  <input type="hidden" name="organizationId" value={account.organizationId} />
                </>
              )}
            </div>
            <div className="field">
              <label htmlFor="name">App Name</label>
              <small className="field-help">The application or service that will use this API key.</small>
              <input id="name" name="name" required placeholder="Production CRM" />
            </div>
            <div className="field">
              <label htmlFor="keyLabel">Key Name</label>
              <small className="field-help">A label describing where the key is used, such as Production, CRM, or Support. This is not the secret key.</small>
              <input id="keyLabel" name="keyLabel" required defaultValue="Production" placeholder="Production, Staging, CRM, Support" />
            </div>
            <button className="primary" type="submit"><Plus size={16} />Create API key</button>
          </form>
        </section>
      ) : null}
    </>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <div className="metric-value">{value}</div>
      <div className="metric-delta"><TrendingUp size={12} />{note}</div>
    </div>
  );
}

function SparkBars({ value }: { value: number }) {
  const seed = Math.max(1, Number(value));
  const heights = [10, 16, 22, 14, 26, 30].map((height, index) => Math.max(8, Math.min(30, height + ((seed + index) % 5))));
  return (
    <span className="spark-bars" aria-hidden="true">
      {heights.map((height, index) => <span key={index} style={{ height }} />)}
    </span>
  );
}
