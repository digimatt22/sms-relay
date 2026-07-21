import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { createUserInvitationAction } from "@/app/actions";
import { query } from "@/lib/db";
import { getCurrentOrganizationId, listOrganizationsForUser } from "@/lib/organizations";
import { requireRolePage } from "@/lib/page-auth";

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
  if (!allowedOrganizations.some((organization: any) => organization.id === id)) notFound();
  const client = await query("SELECT id, name FROM organizations WHERE id = $1", [id]);
  if (!client.rows[0]) notFound();

  return (
    <>
      <header className="page-header">
        <div>
          <p className="muted"><Link href="/organizations">Back to Clients</Link></p>
          <h1>Invite User</h1>
          <p>Add a dashboard user to {client.rows[0].name}.</p>
        </div>
      </header>

      {sp.inviteToken ? (
        <section className="panel" style={{ marginBottom: 16 }}>
          <h2>Invitation created</h2>
          <p className="muted">Send this link to the user. It expires in 7 days.</p>
          <pre>{`/invitations/${sp.inviteToken}`}</pre>
        </section>
      ) : null}

      <section className="panel">
        <form className="form" action={createUserInvitationAction}>
          <input type="hidden" name="organizationId" value={id} />
          <input type="hidden" name="returnTo" value={`/organizations/${id}/invite`} />
          <div className="field">
            <label>Client</label>
            <input value={client.rows[0].name} readOnly />
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
