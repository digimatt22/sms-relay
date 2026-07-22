import { processCallbacksAction, retryCallbackAction } from "@/app/actions";
import { LocalDateTime } from "@/components/local-date-time";
import { listCallbackDeliveries } from "@/lib/callbacks";
import { humanize } from "@/lib/format";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { requireAdminPage } from "@/lib/page-auth";
import { hasRole } from "@/lib/rbac";

export default async function CallbacksPage() {
  const session = await requireAdminPage();
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const deliveries = await listCallbackDeliveries({ organizationId });
  const canOperate = hasRole(session, "operator");

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Callbacks</h1>
          <p>Webhook delivery queue and retries</p>
        </div>
        {canOperate ? (
          <form action={processCallbacksAction}>
            <button className="primary" type="submit">Process due</button>
          </form>
        ) : null}
      </header>

      <section className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Event</th>
              <th>Target</th>
              <th>Attempts</th>
              <th>Next attempt</th>
              <th>Last result</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((delivery: any) => (
              <tr key={delivery.id}>
                <td><span className={`status ${delivery.status}`}>{humanize(delivery.status)}</span></td>
                <td>{humanize(delivery.event_type)}</td>
                <td>{delivery.to_number_redacted || delivery.from_number_redacted || "-"}</td>
                <td>{delivery.attempt_count}</td>
                <td>{delivery.next_attempt_at ? <LocalDateTime value={delivery.next_attempt_at} /> : "-"}</td>
                <td>
                  {delivery.last_http_status || "-"}
                  {delivery.last_response ? <span className="muted"> {String(delivery.last_response).slice(0, 80)}</span> : null}
                </td>
                <td>
                  {canOperate && delivery.status !== "delivered" ? (
                    <form action={retryCallbackAction}>
                      <input type="hidden" name="deliveryId" value={delivery.id} />
                      <button type="submit">Retry</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
            {!deliveries.length ? <tr><td colSpan={7}>No callback deliveries yet.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
