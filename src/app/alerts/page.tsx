import { generateAlertsAction, resolveAlertAction } from "@/app/actions";
import { listAlerts } from "@/lib/alerts";
import { humanize } from "@/lib/format";
import { requireAdminPage } from "@/lib/page-auth";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { hasRole } from "@/lib/rbac";

export default async function AlertsPage() {
  const session = await requireAdminPage();
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const alerts = await listAlerts({ organizationId });
  const canOperate = hasRole(session, "operator");

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Alerts</h1>
          <p>Operational reliability signals</p>
        </div>
        {canOperate ? (
          <form action={generateAlertsAction}>
            <button className="primary" type="submit">Evaluate rules</button>
          </form>
        ) : null}
      </header>

      <section className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Status</th>
              <th>Type</th>
              <th>Message</th>
              <th>Opened</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert: any) => (
              <tr key={alert.id}>
                <td><span className={`status ${alert.severity}`}>{humanize(alert.severity)}</span></td>
                <td>{humanize(alert.status)}</td>
                <td>{humanize(alert.alert_type)}</td>
                <td>
                  {alert.message}
                  {alert.details ? <pre>{JSON.stringify(alert.details, null, 2)}</pre> : null}
                </td>
                <td>{new Date(alert.opened_at).toLocaleString()}</td>
                <td>
                  {canOperate && alert.status === "open" ? (
                    <form action={resolveAlertAction}>
                      <input type="hidden" name="alertId" value={alert.id} />
                      <button type="submit">Resolve</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
            {!alerts.length ? <tr><td colSpan={6}>No alerts yet.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
