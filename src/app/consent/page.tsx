import Link from "next/link";
import { CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import {
  approveMessagingProgramAction,
  createMessagingProgramAction,
  disableMessagingProgramAction,
  revokeRecipientAuthorizationAction
} from "@/app/actions";
import { accountHasRole, getAccountContext } from "@/lib/account-context";
import { requireAdminPage } from "@/lib/page-auth";
import { listMessagingPrograms } from "@/lib/messaging-programs";
import { listRecipientAuthorizations } from "@/lib/recipient-authorizations";
import { getPublicAppUrl } from "@/lib/branding";
import { listOrganizationsForUser } from "@/lib/organizations";

export default async function RecipientConsentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireAdminPage();
  const account = await getAccountContext(session);
  const params = await searchParams;
  const canManageConsent = accountHasRole(account, "org_admin");
  const publicAppUrl = getPublicAppUrl();
  const organizations = account.isPlatformAdmin
    ? await listOrganizationsForUser(session.user.id, session.user.role)
    : [];
  const [programs, authorizations] = await Promise.all([
    listMessagingPrograms({ organizationId: account.isPlatformAdmin ? undefined : account.organizationId }),
    listRecipientAuthorizations({ organizationId: account.isPlatformAdmin ? undefined : account.organizationId })
  ]);
  const verified = authorizations.filter((authorization: any) => authorization.status === "verified_authorized").length;
  const pending = authorizations.filter((authorization: any) => authorization.status === "challenge_pending").length;
  const revoked = authorizations.filter((authorization: any) => ["revoked", "suppressed"].includes(authorization.status)).length;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Recipient Consent</h1>
          <p>
            {canManageConsent
              ? "Create and manage messaging programs and keep auditable phone verification and opt-in records."
              : "View approved messaging programs and auditable phone verification and opt-in records."}
          </p>
        </div>
      </header>

      {params.error ? <section className="notice error">{params.error}</section> : null}

      <section className="metric-grid">
        <Metric label="Verified" value={verified} />
        <Metric label="Pending" value={pending} />
        <Metric label="Revoked / suppressed" value={revoked} />
        <Metric label="Programs" value={programs.length} />
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="page-header" style={{ marginBottom: 12 }}>
          <div>
            <h2>Messaging Programs</h2>
            <p className="muted">
              {account.isPlatformAdmin
                ? "Programs across all clients. Each program fixes its client’s sender identity, purpose, disclosure, and verification template."
                : `Programs for ${account.organizationName}. Each program fixes this client’s sender identity, purpose, disclosure, and verification template.`}
            </p>
          </div>
        </div>
        <table className="table">
          <thead><tr><th>Program</th>{account.isPlatformAdmin ? <th>Client</th> : null}<th>Class</th><th>Status</th><th>Hosted form</th><th /></tr></thead>
          <tbody>
            {programs.map((program: any) => (
              <tr key={program.id}>
                <td>
                  <strong>{program.name}</strong>{program.is_system ? <span className="chip good" style={{ marginLeft: 8 }}>System default</span> : null}
                  <div className="object-meta">{program.sender_display_name} · {program.purpose}</div>
                </td>
                {account.isPlatformAdmin ? <td>{program.organization_name}</td> : null}
                <td>{program.message_class.replace(/_/g, " ")}</td>
                <td><span className={`status ${program.status === "active" ? "active" : "pending"}`}>{program.status.replace(/_/g, " ")}</span></td>
                <td>
                  {program.status === "active" ? (
                    <Link href={`/consent/${program.id}`} target="_blank">
                      {publicAppUrl}/consent/{program.id} <ExternalLink size={13} />
                    </Link>
                  ) : "Available after approval"}
                </td>
                <td>
                  {account.isPlatformAdmin && program.status === "pending_approval" ? (
                    <form action={approveMessagingProgramAction}>
                      <input type="hidden" name="programId" value={program.id} />
                      <input type="hidden" name="organizationId" value={program.organization_id} />
                      <button className="ghost-button" type="submit"><CheckCircle2 size={15} /> Approve</button>
                    </form>
                  ) : null}
                  {canManageConsent && program.status === "active" && !program.is_system ? (
                    <form action={disableMessagingProgramAction}>
                      <input type="hidden" name="programId" value={program.id} />
                      <input type="hidden" name="organizationId" value={program.organization_id} />
                      <button className="ghost-button" type="submit">Disable</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
            {!programs.length ? <tr><td colSpan={account.isPlatformAdmin ? 6 : 5}>No messaging programs yet.</td></tr> : null}
          </tbody>
        </table>
      </section>

      {canManageConsent ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <h2>Create Messaging Program</h2>
          <p className="muted">Platform administrators activate programs immediately. Client administrators submit them for approval.</p>
          <form className="form" action={createMessagingProgramAction}>
            <div className="field">
              <label htmlFor="programOrganization">Client</label>
              <small className="field-help">This program and its recipient authorizations belong only to the selected client.</small>
              {account.isPlatformAdmin ? (
                <select id="programOrganization" name="organizationId" defaultValue={account.organizationId} required>
                  {organizations.map((organization: any) => (
                    <option key={organization.id} value={organization.id}>{organization.name}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input id="programOrganization" value={account.organizationName} readOnly />
                  <input type="hidden" name="organizationId" value={account.organizationId} />
                </>
              )}
            </div>
            <div className="grid">
              <div className="field"><label htmlFor="name">Program Name</label><input id="name" name="name" required placeholder="SwimSense Pool Alerts" /></div>
              <div className="field"><label htmlFor="senderDisplayName">Sender Name</label><input id="senderDisplayName" name="senderDisplayName" required placeholder="SwimSense Pool Monitoring" /></div>
            </div>
            <div className="field">
              <label htmlFor="messageClass">Message Class</label>
              <select id="messageClass" name="messageClass" defaultValue="informational_recurring">
                <option value="informational_recurring">Informational recurring</option>
                <option value="user_requested_transactional">User-requested transactional</option>
                <option value="marketing">Marketing</option>
              </select>
            </div>
            <div className="field"><label htmlFor="purpose">Purpose</label><textarea id="purpose" name="purpose" required placeholder="Pool condition alerts, equipment warnings, and maintenance notifications" /></div>
            <div className="grid">
              <div className="field"><label htmlFor="expectedFrequency">Expected Frequency</label><input id="expectedFrequency" name="expectedFrequency" required defaultValue="Message frequency varies based on pool conditions" /></div>
              <div className="field"><label htmlFor="helpContact">Help Contact</label><input id="helpContact" name="helpContact" required placeholder="support@example.com or 555-123-4567" /></div>
            </div>
            <div className="grid">
              <div className="field"><label htmlFor="termsUrl">Terms URL</label><input id="termsUrl" name="termsUrl" type="url" /></div>
              <div className="field"><label htmlFor="privacyUrl">Privacy URL</label><input id="privacyUrl" name="privacyUrl" type="url" /></div>
            </div>
            <div className="field"><label htmlFor="callbackUrl">Authorization Callback URL</label><input id="callbackUrl" name="callbackUrl" type="url" /></div>
            <button className="primary" type="submit"><ShieldCheck size={16} />Create program</button>
          </form>
        </section>
      ) : (
        <section className="notice" style={{ marginTop: 16 }}>
          Messaging programs are managed by client administrators. Contact your client administrator to create or change a program.
        </section>
      )}

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Authorization Records</h2>
        <table className="table">
          <thead><tr><th>Recipient</th>{account.isPlatformAdmin ? <th>Client</th> : null}<th>Program</th><th>Source</th><th>Status</th><th>Updated</th><th /></tr></thead>
          <tbody>
            {authorizations.map((authorization: any) => (
              <tr key={authorization.id}>
                <td><strong>{authorization.phone_number_redacted}</strong><div className="object-meta">{authorization.client_recipient_reference || "No client reference"}</div></td>
                {account.isPlatformAdmin ? <td>{authorization.organization_name}</td> : null}
                <td>{authorization.program_name}</td>
                <td>{authorization.consent_source.replace(/_/g, " ")}</td>
                <td><span className={`status ${authorization.status === "verified_authorized" ? "active" : authorization.status === "challenge_pending" ? "pending" : "disabled"}`}>{authorization.status.replace(/_/g, " ")}</span></td>
                <td><LocalDateTime value={authorization.verified_at || authorization.requested_at} /></td>
                <td>
                  {canManageConsent && authorization.status === "verified_authorized" ? (
                    <form action={revokeRecipientAuthorizationAction}>
                      <input type="hidden" name="authorizationId" value={authorization.id} />
                      <input type="hidden" name="organizationId" value={authorization.organization_id} />
                      <button className="ghost-button" type="submit">Revoke</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
            {!authorizations.length ? <tr><td colSpan={account.isPlatformAdmin ? 7 : 6}>No recipient authorization records yet.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric-card"><p className="metric-label">{label}</p><div className="metric-value">{value}</div></div>;
}
