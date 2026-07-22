import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { createUserInvitationAction } from "@/app/actions";
import { getCurrentOrganizationId, listOrganizationsForUser } from "@/lib/organizations";
import { requireRolePage } from "@/lib/page-auth";
import { normalizeRole } from "@/lib/rbac";
import { getPublicAppUrl } from "@/lib/branding";

export default async function InviteClientUserPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ inviteToken?: string }>;
}) {
  const session = await requireRolePage("org_admin");
  const { id } = await params;
  const sp = await searchParams;
  const currentOrganizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const allowedOrganizations = await listOrganizationsForUser(session.user.id, session.user.role);
  const platformAdmin = normalizeRole(session.user.role) === "platform_admin";
  const selectedOrganizationId = platformAdmin ? id : currentOrganizationId;
  const selectedClient = allowedOrganizations.find((organization: any) => organization.id === selectedOrganizationId);
  if (!selectedClient) notFound();
  const invitationUrl = sp.inviteToken
    ? `${getPublicAppUrl()}/invitations/${encodeURIComponent(sp.inviteToken)}`
    : null;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="muted"><Link href="/organizations">Back to {platformAdmin ? "Clients" : "Users"}</Link></p>
          <h1>Invite User</h1>
          <p>{platformAdmin ? "Add a dashboard user to a client account." : `Add a dashboard user to ${selectedClient.name}.`}</p>
        </div>
      </header>

      {invitationUrl ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>Invitation created</h2>
          <p className="muted">Send this link to the user. It expires in 7 days.</p>
          <pre>{invitationUrl}</pre>
        </section>
      ) : null}

      <section className="panel">
        <form className="form" action={createUserInvitationAction}>
          <input type="hidden" name="returnTo" value={platformAdmin ? "/organizations" : `/organizations/${selectedOrganizationId}/invite`} />
          <div className="field">
            <label htmlFor="organizationId">Client</label>
            {platformAdmin ? (
              <select id="organizationId" name="organizationId" defaultValue={selectedOrganizationId} required>
                {allowedOrganizations.map((organization: any) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            ) : (
              <>
                <input id="organizationId" value={selectedClient.name} readOnly />
                <input type="hidden" name="organizationId" value={selectedOrganizationId} />
              </>
            )}
          </div>
          <div className="field">
            <label htmlFor="userEmail">Email</label>
            <input id="userEmail" name="email" type="email" required placeholder="operator@example.com" />
          </div>
          <div className="field">
            <label htmlFor="userName">Name</label>
            <input id="userName" name="name" placeholder="Relay Operator" />
          </div>
          <div className="field">
            <label htmlFor="userRole">Role</label>
            <select id="userRole" name="role" defaultValue={currentOrganizationId === id ? "operator" : "viewer"}>
              <option value="org_admin">Client admin</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button className="primary" type="submit"><UserPlus size={16} />Create invite</button>
        </form>
      </section>
    </>
  );
}
