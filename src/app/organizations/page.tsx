import Link from "next/link";
import { Building2, Pencil, RefreshCw, Trash2, UserPlus } from "lucide-react";
import {
  removeOrganizationMembershipAction,
  resendUserInvitationAction,
  revokeUserInvitationAction,
  switchOrganizationAction,
} from "@/app/actions";
import { query } from "@/lib/db";
import { accountHasRole, getAccountContext } from "@/lib/account-context";
import { getOrganizationPlanUsage } from "@/lib/plans";
import { getCurrentOrganizationId, listOrganizationsForUser, listPendingUserInvitations } from "@/lib/organizations";
import { requireAdminPage } from "@/lib/page-auth";

export default async function ClientsAdminPage({
  searchParams
}: {
  searchParams: Promise<{ inviteToken?: string; clientId?: string }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const account = await getAccountContext(session);
  const canManageUsers = accountHasRole(account, "org_admin");
  const clients = await listOrganizationsForUser(session.user.id, session.user.role);
  const currentOrganizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const clientIds = clients.map((client: any) => client.id);
  const selectedClientId = sp.clientId && clientIds.includes(sp.clientId) ? sp.clientId : "";
  const memberships = await query(
    `SELECT m.*, u.email, u.name AS user_name, o.name AS client_name
       FROM organization_memberships m
      JOIN admin_users u ON u.id = m.user_id
      JOIN organizations o ON o.id = m.organization_id
      WHERE o.id = ANY($1::uuid[])
        AND m.role <> 'platform_admin'
        AND u.role NOT IN ('platform_admin', 'admin')
      ORDER BY o.name ASC, u.email ASC`,
    [clientIds]
  );
  const allInvitations = await listPendingUserInvitations(clientIds);
  const filteredMemberships = selectedClientId
    ? memberships.rows.filter((membership: any) => membership.organization_id === selectedClientId)
    : memberships.rows;
  const invitations = selectedClientId
    ? allInvitations.filter((invitation: any) => invitation.organization_id === selectedClientId)
    : allInvitations;
  const stats = await query(
    `SELECT o.id,
            COUNT(DISTINCT c.id)::int AS api_app_count,
            COUNT(DISTINCT m.id)::int AS message_count,
            COUNT(DISTINCT i.id)::int AS inbound_count
       FROM organizations o
       LEFT JOIN api_clients c ON c.organization_id = o.id
       LEFT JOIN messages m ON m.organization_id = o.id
       LEFT JOIN inbound_messages i ON i.organization_id = o.id
      WHERE o.id = ANY($1::uuid[])
      GROUP BY o.id`,
    [clientIds]
  );
  const statByClient = new Map(stats.rows.map((row: any) => [row.id, row]));
  const usersByClient = new Map<string, any[]>();
  memberships.rows.forEach((membership: any) => {
    const list = usersByClient.get(membership.organization_id) || [];
    list.push(membership);
    usersByClient.set(membership.organization_id, list);
  });
  const platformAdmin = session.user.role === "platform_admin";
  const planUsage = platformAdmin ? null : await getOrganizationPlanUsage(account.organizationId);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="muted">{platformAdmin ? "Platform Admin" : account.organizationName}</p>
          <h1>{platformAdmin ? "Clients" : "Users"}</h1>
          <p>{platformAdmin ? "Manage client tenants, users under each client, and their API apps/keys." : canManageUsers ? "Manage users who can access this account." : "View users who can access this account."}</p>
        </div>
        <div className="actions-row">
          {platformAdmin ? <Link className="button" href="/organizations/new"><Building2 size={16} />Create client</Link> : null}
        </div>
      </header>

      {platformAdmin ? (
        <section className="notice" style={{ marginBottom: 16 }}>
          <strong>Platform admin access:</strong> your account is global. You can manage every client without needing to be listed as a user inside each client.
        </section>
      ) : null}

      <section className="metric-grid">
        <MetricCard label={platformAdmin ? "Clients" : "Users"} value={platformAdmin ? clients.length : filteredMemberships.length} note={platformAdmin ? "Tenant accounts" : `${planUsage?.users || 0} / ${account.plan.includedUsers} included`} />
        <MetricCard label="Pending invites" value={invitations.length} note="Awaiting acceptance" />
        <MetricCard label="API apps" value={stats.rows.reduce((sum: number, row: any) => sum + row.api_app_count, 0)} note="Across visible clients" />
        {platformAdmin ? <MetricCard label="Plan" value={account.plan.name} note={account.plan.displayPrice} /> : null}
      </section>

      {sp.inviteToken ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>Invitation created</h2>
          <p className="muted">Send this link to the user. It expires in 7 days.</p>
          <pre>{`/invitations/${sp.inviteToken}`}</pre>
        </section>
      ) : null}

      {platformAdmin ? (
      <section className="panel">
        <h2>Client roster</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Users</th>
              <th>API apps</th>
              <th>Messages</th>
              <th>Inbound</th>
              <th>Active context</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client: any) => {
              const clientStats = statByClient.get(client.id) as any;
              const users = usersByClient.get(client.id) || [];
              return (
                <tr key={client.id}>
                  <td>
                    <strong>{client.name}</strong>
                    <div className="object-meta">{client.slug}</div>
                  </td>
                  <td>
                    {users.length ? (
                      <div className="object-list">
                        {users.map((user: any) => (
                          <span key={user.id}>{user.user_name || user.email} <span className="chip">{user.role}</span></span>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">No client users</span>
                    )}
                  </td>
                  <td>{clientStats?.api_app_count || 0}</td>
                  <td>{clientStats?.message_count || 0}</td>
                  <td>{clientStats?.inbound_count || 0}</td>
                  <td>
                    {client.id === currentOrganizationId ? (
                      <span className="chip good">Current</span>
                    ) : (
                      <form action={switchOrganizationAction}>
                        <input type="hidden" name="organizationId" value={client.id} />
                        <button className="secondary-button" type="submit">Switch</button>
                      </form>
                    )}
                  </td>
                  <td>
                    <Link className="icon-button" href={`/organizations/${client.id}/invite`} aria-label={`Invite user to ${client.name}`}>
                      <UserPlus size={16} />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!clients.length ? <tr><td colSpan={7}>No clients yet.</td></tr> : null}
          </tbody>
        </table>
      </section>
      ) : null}

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="page-header" style={{ marginBottom: 12 }}>
          <div>
            <h2>Client Users</h2>
            <p className="muted">{platformAdmin ? "Manage users across visible clients." : "Manage users who can access this client account."}</p>
          </div>
          {!platformAdmin && canManageUsers ? (
            <Link className="button" href={`/organizations/${account.organizationId}/invite`}><UserPlus size={16} />Invite user</Link>
          ) : null}
        </div>
        {canManageUsers && clients.length > 1 ? (
          <form className="actions-row" method="get" style={{ justifyContent: "flex-start", marginBottom: 16 }}>
            <label htmlFor="clientFilter">Client</label>
            <select id="clientFilter" name="clientId" defaultValue={selectedClientId}>
              <option value="">All clients</option>
              {clients.map((client: any) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            <button className="secondary-button" type="submit">Filter</button>
          </form>
        ) : null}
        <table className="table">
          <thead><tr><th>Client</th><th>User</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filteredMemberships.map((membership: any) => (
              <tr key={membership.id}>
                <td>{membership.client_name}</td>
                <td>
                  {membership.user_name || membership.email}
                  {membership.user_name ? <div className="object-meta">{membership.email}</div> : null}
                </td>
                <td><span className="chip">{membership.role}</span></td>
                <td><span className={`chip ${membership.status === "active" ? "good" : "warn"}`}>{membership.status}</span></td>
                <td>
                  {canManageUsers ? (
                    <div className="actions-row" style={{ justifyContent: "flex-start" }}>
                    <Link className="icon-button" href={`/organizations/users/${membership.id}/edit`} aria-label={`Edit ${membership.email}`}>
                      <Pencil size={15} />
                    </Link>
                    <form action={removeOrganizationMembershipAction}>
                      <input type="hidden" name="organizationId" value={membership.organization_id} />
                      <input type="hidden" name="userId" value={membership.user_id} />
                      <button className="icon-button danger" type="submit" aria-label={`Remove ${membership.email}`}>
                        <Trash2 size={15} />
                      </button>
                    </form>
                    </div>
                  ) : (
                    <span className="muted">View only</span>
                  )}
                </td>
              </tr>
            ))}
            {invitations.map((invitation: any) => (
              <tr key={invitation.id}>
                <td>{invitation.organization_name}</td>
                <td>
                  {invitation.name || invitation.email}
                  <div className="object-meta">{invitation.email}</div>
                </td>
                <td>{invitation.role}</td>
                <td>
                  <span className="chip warn">Pending invite</span>
                  <div className="object-meta">Expires {new Date(invitation.expires_at).toLocaleString()}</div>
                </td>
                <td>
                  {canManageUsers ? (
                    <div className="actions-row" style={{ justifyContent: "flex-start" }}>
                    <form action={resendUserInvitationAction}>
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <button className="icon-button" type="submit" aria-label={`Resend invite to ${invitation.email}`}>
                        <RefreshCw size={15} />
                      </button>
                    </form>
                    <form action={revokeUserInvitationAction}>
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <button className="icon-button danger" type="submit" aria-label={`Revoke invite to ${invitation.email}`}>
                        <Trash2 size={15} />
                      </button>
                    </form>
                    </div>
                  ) : (
                    <span className="muted">View only</span>
                  )}
                </td>
              </tr>
            ))}
            {!filteredMemberships.length && !invitations.length ? <tr><td colSpan={5}>No client users found.</td></tr> : null}
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
