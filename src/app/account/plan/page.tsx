import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getAccountContext } from "@/lib/account-context";
import { getOrganizationPlanUsage } from "@/lib/plans";
import { requireRolePage } from "@/lib/page-auth";

export default async function AccountPlanPage() {
  const session = await requireRolePage("platform_admin");
  const account = await getAccountContext(session);
  const usage = await getOrganizationPlanUsage(account.organizationId);

  const limits = [
    {
      label: "Monthly messages",
      used: Number(usage.monthly_messages || 0),
      limit: account.plan.monthlyMessageLimit
    },
    {
      label: "Users",
      used: Number(usage.users || 0),
      limit: account.plan.includedUsers
    },
    {
      label: "Active API keys",
      used: Number(usage.api_keys || 0),
      limit: account.plan.includedApiKeys
    },
    {
      label: "Private gateways",
      used: Number(usage.visible_private_gateways || 0),
      limit: account.plan.includedGateways
    }
  ];

  return (
    <>
      <header className="page-header">
        <div>
          <p className="muted">{account.organizationName}</p>
          <h1>Plan & Billing</h1>
          <p>Current account plan, included usage, and enabled platform capabilities.</p>
        </div>
        <Link className="button secondary" href="/pricing">View public plans</Link>
      </header>

      <section className="metric-grid">
        <MetricCard label="Current plan" value={account.plan.name} note={account.plan.displayPrice} />
        <MetricCard label="Support" value={account.plan.supportLevel} note={`${account.plan.logRetentionDays} day logs`} />
        <MetricCard label="Callbacks" value={account.plan.callbackAllowed ? "Included" : "Not included"} note="Webhook delivery" />
        <MetricCard label="Private gateways" value={account.plan.privateGatewayAllowed ? "Available" : "Shared only"} note={`${account.plan.includedGateways} included`} />
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Usage against plan</h2>
        <div className="object-list">
          {limits.map((item) => {
            const percent = item.limit > 0 ? Math.min(100, Math.round((item.used / item.limit) * 100)) : 0;
            return (
              <div key={item.label}>
                <div className="relationship-row" style={{ justifyContent: "space-between" }}>
                  <strong>{item.label}</strong>
                  <span>{item.used.toLocaleString()} / {item.limit.toLocaleString()}</span>
                </div>
                <div style={{ background: "#e8eef8", borderRadius: 999, height: 8, marginTop: 8 }}>
                  <div style={{ width: `${percent}%`, background: "#0f9b8e", height: 8, borderRadius: 999 }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Included capabilities</h2>
        <div className="object-list">
          <Capability enabled label={`${account.plan.monthlyMessageLimit.toLocaleString()} outbound messages per month`} />
          <Capability enabled label={`${account.plan.includedUsers} dashboard user${account.plan.includedUsers === 1 ? "" : "s"}`} />
          <Capability enabled label={`${account.plan.includedApiKeys} active API key${account.plan.includedApiKeys === 1 ? "" : "s"}`} />
          <Capability enabled={account.plan.callbackAllowed} label="Callback/webhook delivery" />
          <Capability enabled={account.plan.privateGatewayAllowed} label="Client-owned gateway visibility" />
        </div>
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

function Capability({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div className="relationship-row">
      <CheckCircle2 size={16} color={enabled ? "#0f9b8e" : "#94a3b8"} />
      <span className={enabled ? "" : "muted"}>{label}</span>
    </div>
  );
}
