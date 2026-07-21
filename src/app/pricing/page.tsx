import { CheckCircle2, Mail, RadioTower, ShieldCheck, Workflow } from "lucide-react";
import { createPricingLeadAction } from "@/app/actions";
import { listPublicPlans } from "@/lib/plans";

export default async function PricingPage({
  searchParams
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const plans = await listPublicPlans();
  const params = await searchParams;

  return (
    <main className="public-page">
      <section className="public-hero">
        <div>
          <div className="brand brand-lockup">
            <span className="brand-mark"><Workflow size={17} /></span>
            <span>RelayHub SMS</span>
          </div>
          <h1>SMS relay infrastructure without giving up operational control.</h1>
          <p>
            RelayHub combines hosted queue management, API-driven sending, remote gateway
            appliances, inbound replies, retries, health monitoring, and account-level controls
            for teams that need reliable SMS workflows.
          </p>
          <div className="actions-row" style={{ justifyContent: "flex-start" }}>
            <a className="button" href="#signup"><Mail size={16} />Get more information</a>
            <a className="button secondary" href="#plans">Compare plans</a>
          </div>
        </div>
        <div className="public-signal-panel">
          <div className="relationship-row" style={{ justifyContent: "space-between" }}>
            <span className="chip good">Fleet ready</span>
            <RadioTower size={22} color="#0f766e" />
          </div>
          <div className="metric-value">99.9%</div>
          <p className="muted">Target relay availability with monitored gateways and retry-aware queues.</p>
          <div className="object-list">
            <span><ShieldCheck size={15} /> API keys per client account</span>
            <span><ShieldCheck size={15} /> Client-owned gateway visibility</span>
            <span><ShieldCheck size={15} /> Inbound STOP/YES/NO reply handling</span>
          </div>
        </div>
      </section>

      <section className="panel public-panel" id="plans">
        <div className="page-header">
          <div>
            <p className="muted">Pricing</p>
            <h2>Choose a plan by message volume and team size</h2>
            <p>Each plan includes the RelayHub dashboard, API access, queue controls, gateway monitoring, and SMS reply handling.</p>
          </div>
        </div>
        <div className="pricing-grid">
          {plans.map((plan: any) => (
            <article className="pricing-card" key={plan.slug}>
              <div>
                <span className="chip">{plan.support_level}</span>
                <h3>{plan.name}</h3>
                <p className="muted">{plan.description}</p>
              </div>
              <div className="price">{plan.display_price}</div>
              <ul className="feature-list">
                <Feature>{Number(plan.monthly_message_limit).toLocaleString()} sent messages/month</Feature>
                <Feature>{plan.included_users} user{plan.included_users === 1 ? "" : "s"}</Feature>
                <Feature>{plan.included_api_keys} active API key{plan.included_api_keys === 1 ? "" : "s"}</Feature>
                <Feature>{plan.included_gateways} private gateway{plan.included_gateways === 1 ? "" : "s"} included</Feature>
                <Feature>{plan.callback_allowed ? "Callbacks included" : "Dashboard and API status only"}</Feature>
                <Feature>{plan.log_retention_days} day log retention</Feature>
              </ul>
              <a className="button secondary" href={`#signup`}>Ask about {plan.name}</a>
            </article>
          ))}
        </div>
      </section>

      <section className="public-panel public-info-grid">
        <article className="panel">
          <h2>What is included?</h2>
          <div className="object-list">
            <Feature>Cloud-hosted command center for queue health, usage, alerts, and replies</Feature>
            <Feature>API keys for client applications and dashboard-based test sends</Feature>
            <Feature>Remote RelayHub Edge gateway appliances with heartbeat and signal reporting</Feature>
            <Feature>Retries, duplicate protection, failover-ready routing pools, and 90+ day operational visibility on higher tiers</Feature>
          </div>
        </article>
        <article className="panel">
          <h2>Pricing questions answered</h2>
          <div className="object-list">
            <Feature>Message limits are monthly sent-message allowances before overage terms are finalized.</Feature>
            <Feature>Carrier SIM plans and hardware purchases can be quoted separately.</Feature>
            <Feature>Dedicated/client-owned gateways are included only on plans that list private gateways.</Feature>
            <Feature>Final production pricing can be adjusted before launch.</Feature>
          </div>
        </article>
      </section>

      <section className="panel public-panel signup-panel" id="signup">
        <div>
          <p className="muted">Get more information</p>
          <h2>Tell us where to send RelayHub details.</h2>
          <p className="muted">We will use this to follow up about pricing, deployment options, and gateway availability.</p>
        </div>
        {params.lead === "ok" ? <div className="notice">Thanks. Your email has been saved.</div> : null}
        {params.lead === "invalid" ? <div className="notice error">Enter a valid email address.</div> : null}
        <form className="form lead-form" action={createPricingLeadAction}>
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" required placeholder="you@company.com" />
          </div>
          <div className="field">
            <label htmlFor="company">Company</label>
            <input id="company" name="company" placeholder="Company name" />
          </div>
          <div className="field">
            <label htmlFor="planSlug">Plan interest</label>
            <select id="planSlug" name="planSlug" defaultValue="">
              <option value="">Not sure yet</option>
              {plans.map((plan: any) => <option key={plan.slug} value={plan.slug}>{plan.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="notes">What are you trying to support?</label>
            <textarea id="notes" name="notes" rows={4} placeholder="Approximate monthly volume, number of users, or gateway needs" />
          </div>
          <button className="primary" type="submit"><Mail size={16} />Request information</button>
        </form>
      </section>
    </main>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li>
      <CheckCircle2 size={16} />
      <span>{children}</span>
    </li>
  );
}
