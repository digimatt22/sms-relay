import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/page-auth";
import { getInboundMessage } from "@/lib/inbound";
import { humanize } from "@/lib/format";
import { getCurrentOrganizationId } from "@/lib/organizations";

export default async function InboundMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();
  const { id } = await params;
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const message = await getInboundMessage(id, { organizationId, markRead: true });
  if (!message) notFound();

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Inbound message</h1>
          <p>{message.from_number_redacted} via {message.gateway_name || "unknown gateway"}</p>
        </div>
        <Link className="button secondary" href="/inbox">Back to inbox</Link>
      </header>

      <section className="detail-grid">
        <div>
          <h2>Message</h2>
          <dl>
            <dt>From</dt>
            <dd>{message.from_number_redacted}</dd>
            <dt>Received</dt>
            <dd>{new Date(message.received_at).toLocaleString()}</dd>
            <dt>Modem index</dt>
            <dd>{message.modem_index ?? "-"}</dd>
            <dt>Body</dt>
            <dd>{message.body}</dd>
          </dl>
        </div>
        <div>
          <h2>Routing</h2>
          <dl>
            <dt>Matched outbound</dt>
            <dd>
              {message.matched_message_id ? (
                <Link href={`/messages/${message.matched_message_id}`}>{message.matched_message_id}</Link>
              ) : "-"}
            </dd>
            <dt>Callback URL</dt>
            <dd>{message.callback_url || "-"}</dd>
            <dt>Callback status</dt>
            <dd><span className={`status ${message.callback_status}`}>{humanize(message.callback_status)}</span></dd>
            <dt>HTTP status</dt>
            <dd>{message.callback_http_status || "-"}</dd>
            <dt>Callback response</dt>
            <dd>{message.callback_response || "-"}</dd>
          </dl>
        </div>
      </section>
    </>
  );
}
