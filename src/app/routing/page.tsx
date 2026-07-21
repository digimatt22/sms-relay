import { GitBranch, Plus, RadioTower, Route, Trash2 } from "lucide-react";
import {
  addGatewayToPoolAction,
  createGatewayPoolAction,
  grantClientPoolAccessAction,
  removeGatewayFromPoolAction,
  revokeClientPoolAccessAction
} from "@/app/actions";
import { query } from "@/lib/db";
import { humanize } from "@/lib/format";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { requireRolePage } from "@/lib/page-auth";

export default async function RoutingPage() {
  const session = await requireRolePage("org_admin");
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });

  const pools = await query(
    `SELECT p.*,
            COALESCE(
              json_agg(DISTINCT jsonb_build_object(
                'id', g.id,
                'name', g.name,
                'status', g.status,
                'lastHeartbeatAt', g.last_heartbeat_at
              )) FILTER (WHERE g.id IS NOT NULL),
              '[]'
            ) AS gateways,
            COALESCE(
              json_agg(DISTINCT jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'status', c.status,
                'isDefault', a.is_default
              )) FILTER (WHERE c.id IS NOT NULL),
              '[]'
            ) AS clients
       FROM gateway_pools p
       LEFT JOIN gateway_pool_memberships gm ON gm.gateway_pool_id = p.id
       LEFT JOIN gateways g ON g.id = gm.gateway_id
       LEFT JOIN api_client_gateway_pool_access a ON a.gateway_pool_id = p.id
       LEFT JOIN api_clients c ON c.id = a.api_client_id
      WHERE p.organization_id = $1
      GROUP BY p.id
      ORDER BY p.is_default DESC, p.name ASC`,
    [organizationId]
  );
  const gateways = await query(
    "SELECT id, name, status FROM gateways WHERE disabled_at IS NULL AND organization_id = $1 ORDER BY name ASC",
    [organizationId]
  );
  const clients = await query(
    "SELECT id, name, status FROM api_clients WHERE disabled_at IS NULL AND organization_id = $1 ORDER BY name ASC",
    [organizationId]
  );

  const gatewayAssignments = new Set<string>();
  const clientAssignments = new Set<string>();
  pools.rows.forEach((pool: any) => {
    pool.gateways.forEach((gateway: any) => gatewayAssignments.add(gateway.id));
    pool.clients.forEach((client: any) => clientAssignments.add(client.id));
  });
  const globalPool = pools.rows.find((pool: any) => pool.is_default) || pools.rows[0];

  return (
    <>
      <header className="page-header">
        <div>
          <p className="muted">Pools & Routing</p>
          <h1>Routing Pools</h1>
          <p>Manage which gateways a client can use. Launch traffic should stay in the Global Pool.</p>
        </div>
        <div className="actions-row">
          <a className="button secondary" href="#assignments"><GitBranch size={16} />Assignments</a>
          <a className="button" href="#create-pool"><Plus size={16} />Create pool</a>
        </div>
      </header>

      <section className="metric-grid">
        <MetricCard label="Pools" value={pools.rows.length} note={globalPool ? `${globalPool.name} active` : "none"} />
        <MetricCard label="Gateway Memberships" value={pools.rows.reduce((sum: number, pool: any) => sum + pool.gateways.length, 0)} note={`${gateways.rows.length} gateways available`} />
        <MetricCard label="Client Access Rules" value={pools.rows.reduce((sum: number, pool: any) => sum + pool.clients.length, 0)} note={`${clients.rows.length} API apps available`} />
        <MetricCard label="Unassigned" value={`${gateways.rows.length - gatewayAssignments.size} / ${clients.rows.length - clientAssignments.size}`} note="gateways / API apps" />
      </section>

      <section className="notice" style={{ marginBottom: 16 }}>
        <strong>Current launch model:</strong> keep all active gateways and API apps in the Global Pool. Private pools will let one client route only through dedicated gateways later.
      </section>

      <section className="panel">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <div>
            <h2>Pool roster</h2>
            <p className="muted">Pools are the routing boundary between client API apps and gateway appliances.</p>
          </div>
        </div>
        <div className="object-list">
          {pools.rows.map((pool: any) => (
            <PoolCard pool={pool} key={pool.id} />
          ))}
          {!pools.rows.length ? <p className="muted">No routing pools yet.</p> : null}
        </div>
      </section>

      <div className="grid" id="assignments" style={{ marginTop: 16 }}>
        <section className="panel">
          <h2>Add gateway to pool</h2>
          <p className="muted" style={{ marginBottom: 12 }}>A gateway can belong to one or more pools. For launch, add every gateway to Global Pool.</p>
          <form className="form" action={addGatewayToPoolAction}>
            <SelectPool pools={pools.rows} />
            <div className="field">
              <label htmlFor="gatewayId">Gateway</label>
              <select id="gatewayId" name="gatewayId" required>
                <option value="">Select gateway</option>
                {gateways.rows.map((gateway: any) => (
                  <option key={gateway.id} value={gateway.id}>{gateway.name} ({humanize(gateway.status)})</option>
                ))}
              </select>
            </div>
            <button className="primary" type="submit"><RadioTower size={16} />Add gateway</button>
          </form>
        </section>

        <section className="panel">
          <h2>Add client to pool</h2>
          <p className="muted" style={{ marginBottom: 12 }}>Client API apps can be granted access to a shared or private pool.</p>
          <form className="form" action={grantClientPoolAccessAction}>
            <div className="field">
              <label htmlFor="clientId">API app</label>
              <select id="clientId" name="clientId" required>
                <option value="">Select API app</option>
                {clients.rows.map((client: any) => (
                  <option key={client.id} value={client.id}>{client.name} ({humanize(client.status)})</option>
                ))}
              </select>
            </div>
            <SelectPool pools={pools.rows} />
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input name="makeDefault" type="checkbox" defaultChecked />
              Make this the default pool for this API app
            </label>
            <button className="primary" type="submit"><GitBranch size={16} />Grant access</button>
          </form>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Pool assignments</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Pool</th>
              <th>Gateways in pool</th>
              <th>API apps with access</th>
            </tr>
          </thead>
          <tbody>
            {pools.rows.map((pool: any) => (
              <tr key={pool.id}>
                <td>
                  <strong>{pool.name}</strong>
                  {pool.is_default ? <span className="chip good" style={{ marginLeft: 8 }}>Global</span> : null}
                  <div className="object-meta">{pool.description || pool.slug}</div>
                </td>
                <td><AssignmentList items={pool.gateways} poolId={pool.id} type="gateway" /></td>
                <td><AssignmentList items={pool.clients} poolId={pool.id} type="client" /></td>
              </tr>
            ))}
            {!pools.rows.length ? <tr><td colSpan={3}>No pools yet.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="panel" id="create-pool" style={{ marginTop: 16 }}>
        <h2>Create private pool</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Use private pools later when one client needs dedicated gateways. Keep launch traffic in Global Pool.</p>
        <form className="form" action={createGatewayPoolAction}>
          <div className="grid">
            <div className="field">
              <label htmlFor="name">Pool name</label>
              <input id="name" name="name" required placeholder="Acme Private Pool" />
            </div>
            <div className="field">
              <label htmlFor="description">Description</label>
              <input id="description" name="description" placeholder="Dedicated gateways for Acme" />
            </div>
          </div>
          <button className="primary" type="submit"><Route size={16} />Create pool</button>
        </form>
      </section>
    </>
  );
}

function PoolCard({ pool }: { pool: any }) {
  return (
    <div className="object-row">
      <div>
        <div className="object-title">
          {pool.name}
          {pool.is_default ? <span className="chip good" style={{ marginLeft: 8 }}>Global Pool</span> : <span className="chip" style={{ marginLeft: 8 }}>Private Pool</span>}
        </div>
        <div className="object-meta">{pool.description || pool.slug}</div>
        <div className="relationship-row" style={{ marginTop: 10 }}>
          <span className="chip">Gateways: {pool.gateways.length}</span>
          <span className="chip">API apps: {pool.clients.length}</span>
          {pool.gateways.slice(0, 3).map((gateway: any) => <span className="chip good" key={gateway.id}>{gateway.name}</span>)}
          {pool.clients.slice(0, 3).map((client: any) => (
            <span className="chip" key={client.id}>{client.name}{client.isDefault ? " default" : ""}</span>
          ))}
        </div>
      </div>
      <span className="chip">{pool.id.slice(0, 8)}</span>
    </div>
  );
}

function SelectPool({ pools }: { pools: any[] }) {
  return (
    <div className="field">
      <label htmlFor="poolId">Pool</label>
      <select id="poolId" name="poolId" required>
        <option value="">Select pool</option>
        {pools.map((pool: any) => (
          <option key={pool.id} value={pool.id}>{pool.name}{pool.is_default ? " (Global)" : ""}</option>
        ))}
      </select>
    </div>
  );
}

function AssignmentList({ items, poolId, type }: { items: any[]; poolId: string; type: "gateway" | "client" }) {
  if (!items.length) return <span className="muted">None assigned</span>;
  const action = type === "gateway" ? removeGatewayFromPoolAction : revokeClientPoolAccessAction;
  return (
    <div className="object-list">
      {items.map((item: any) => (
        <div className="relationship-row" key={item.id} style={{ justifyContent: "space-between" }}>
          <span>
            <strong>{item.name}</strong>
            {item.isDefault ? <span className="chip good" style={{ marginLeft: 8 }}>Default</span> : null}
          </span>
          <form action={action}>
            <input type="hidden" name="poolId" value={poolId} />
            <input type="hidden" name={type === "gateway" ? "gatewayId" : "clientId"} value={item.id} />
            <button className="icon-button" type="submit" aria-label={`Remove ${item.name}`}>
              <Trash2 size={14} />
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <div className="relationship-row" style={{ justifyContent: "space-between" }}>
        <div className="metric-value">{value}</div>
        <RadioTower size={28} color="#0f766e" />
      </div>
      <div className="metric-note">{note}</div>
    </div>
  );
}
