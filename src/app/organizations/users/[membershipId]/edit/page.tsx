import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateClientUserAction } from "@/app/actions";
import { accountHasRole, getAccountContext } from "@/lib/account-context";
import { query } from "@/lib/db";
import { requireAdminPage } from "@/lib/page-auth";

export default async function EditClientUserPage({
  params,
  searchParams
}: {
  params: Promise<{ membershipId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireAdminPage();
  const account = await getAccountContext(session);
  if (!accountHasRole(account, "org_admin")) redirect("/organizations");
  const { membershipId } = await params;
  const sp = await searchParams;
  const result = await query(
    `SELECT m.id, m.organization_id, m.user_id, m.role, m.status,
            u.email, u.name, o.name AS client_name
       FROM organization_memberships m
       JOIN admin_users u ON u.id = m.user_id
       JOIN organizations o ON o.id = m.organization_id
      WHERE m.id = $1
        AND m.role <> 'platform_admin'
        AND u.role NOT IN ('platform_admin', 'admin')
        AND ($2::boolean = true OR m.organization_id = $3)`,
    [membershipId, account.isPlatformAdmin, account.organizationId]
  );
  const membership = result.rows[0];
  if (!membership) notFound();
  const editingSelf = membership.user_id === session.user.id && !account.isPlatformAdmin;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="muted"><Link href="/organizations">Back to Client Users</Link></p>
          <h1>Edit Client User</h1>
          <p>Manage this user&apos;s access to {membership.client_name}.</p>
        </div>
      </header>

      <section className="panel">
        <form className="form" action={updateClientUserAction}>
          {sp.error ? <p className="error">{sp.error}</p> : null}
          <input type="hidden" name="membershipId" value={membership.id} />
          <input type="hidden" name="organizationId" value={membership.organization_id} />
          <input type="hidden" name="userId" value={membership.user_id} />
          <div className="field">
            <label htmlFor="clientName">Client</label>
            <input id="clientName" value={membership.client_name} readOnly />
          </div>
          <div className="field">
            <label htmlFor="userEmail">Email</label>
            <input id="userEmail" value={membership.email} readOnly />
          </div>
          <div className="field">
            <label htmlFor="userName">Name</label>
            <input id="userName" name="name" defaultValue={membership.name || ""} required />
          </div>
          <div className="field">
            <label htmlFor="userRole">Role</label>
            <select id="userRole" name="role" defaultValue={membership.role} disabled={editingSelf}>
              <option value="org_admin">Client admin</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </select>
            {editingSelf ? <input type="hidden" name="role" value={membership.role} /> : null}
          </div>
          <div className="field">
            <label htmlFor="userStatus">Status</label>
            <select id="userStatus" name="status" defaultValue={membership.status} disabled={editingSelf}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            {editingSelf ? (
              <>
                <input type="hidden" name="status" value="active" />
                <span className="muted">You cannot disable your own client-admin access.</span>
              </>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="temporaryPassword">Temporary password</label>
            <input id="temporaryPassword" name="password" type="password" minLength={12} autoComplete="new-password" />
            <span className="muted">Leave blank to keep the current password. A changed password must be replaced by the user at next login.</span>
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirm temporary password</label>
            <input id="confirmPassword" name="confirmPassword" type="password" minLength={12} autoComplete="new-password" />
          </div>
          <div className="actions-row" style={{ justifyContent: "flex-start" }}>
            <button className="primary" type="submit">Update user</button>
            <Link className="secondary-button" href="/organizations">Cancel</Link>
          </div>
        </form>
      </section>
    </>
  );
}
