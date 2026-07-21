import { notFound } from "next/navigation";
import { Ban, Download, MessageCircleReply, RotateCcw, Send } from "lucide-react";
import { requireAdminPage } from "@/lib/page-auth";
import { getMessage } from "@/lib/messages";
import { humanize } from "@/lib/format";
import { cancelMessageAction, requeueMessageAction } from "@/app/actions";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { hasRole } from "@/lib/rbac";
import { query } from "@/lib/db";

export default async function MessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();
  const { id } = await params;
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const { message, attempts } = await getMessage(id);
  if (!message || message.organization_id !== organizationId) notFound();
  const [replies, callbacks] = await Promise.all([
    query(
      `SELECT *
         FROM inbound_messages
        WHERE matched_message_id = $1
        ORDER BY received_at DESC`,
      [message.id]
    ),
    query(
      `SELECT *
         FROM callback_deliveries
        WHERE message_id = $1
           OR inbound_message_id IN (SELECT id FROM inbound_messages WHERE matched_message_id = $1)
        ORDER BY created_at DESC
        LIMIT 10`,
      [message.id]
    )
  ]);
  const canOperate = hasRole(session, "operator");
  const canCancel = canOperate && ["queued", "retry_scheduled", "claimed"].includes(message.status);
  const canRequeue = canOperate && message.status !== "carrier_submitted";

  return (
    <>
      <header className="page-header">
        <div>
          <p className="muted"><a href="/messages">Back to Messages</a></p>
          <h1>Message {message.id}</h1>
          <p>Created {new Date(message.created_at).toLocaleString()} · Source: {message.api_client_name || humanize(message.submitted_via || "dashboard")}</p>
        </div>
        <div className="actions-row">
          <span className={`status ${message.status}`}>{humanize(message.status)}</span>
          {canCancel ? (
            <form action={cancelMessageAction}>
              <input type="hidden" name="messageId" value={message.id} />
              <button className="secondary-button danger" type="submit"><Ban size={16} />Cancel</button>
            </form>
          ) : null}
          {canRequeue ? (
            <form action={requeueMessageAction}>
              <input type="hidden" name="messageId" value={message.id} />
              <button className="secondary-button" type="submit"><RotateCcw size={16} />Requeue</button>
            </form>
          ) : null}
        </div>
      </header>
      <section className="metric-grid">
        <MetricCard label="Attempts" value={message.attempt_count} note={message.last_error || "No active error"} />
        <MetricCard label="Replies" value={replies.rows.length} note="Inbound SMS linked to this outbound" />
        <MetricCard label="Callbacks" value={callbacks.rows.length} note="Webhook delivery records" />
        <MetricCard label="Priority" value={message.priority} note="Routing priority" />
      </section>

      <div className="route-card-grid">
        <section className="panel">
          <h2>Conversation</h2>
          <div className="conversation-thread">
            <div className="conversation-bubble outbound">
              <div className="conversation-label"><Send size={17} color="#009688" />Outbound <span className={`status ${message.status}`}>{humanize(message.status)}</span></div>
              <div>{message.body}</div>
              <div className="object-meta">To: {message.to_number_redacted} · Client: {message.api_client_name || humanize(message.submitted_via || "dashboard")}</div>
            </div>
            {replies.rows.map((reply: any) => (
              <div className="conversation-bubble inbound" key={reply.id}>
                <div className="conversation-label"><MessageCircleReply size={17} color="#2563eb" />Inbound <span className={`status ${reply.callback_status}`}>{humanize(reply.callback_status)}</span></div>
                <div>{reply.body}</div>
                <div className="object-meta">From: {reply.from_number_redacted} · {new Date(reply.received_at).toLocaleString()}</div>
              </div>
            ))}
            {!replies.rows.length ? <p className="muted">No reply has been matched to this outbound message yet.</p> : null}
          </div>
        </section>
        <section className="panel">
          <h2>Message Lifecycle</h2>
          <div className="timeline">
            <TimelineItem title="Created" detail={new Date(message.created_at).toLocaleString()} state="success" />
            {attempts.map((attempt: any) => (
              <TimelineItem
                key={attempt.id}
                title={`Attempt ${attempt.attempt_number}: ${humanize(attempt.status)}`}
                detail={`${attempt.gateway_name || "Unknown gateway"} · ${attempt.error_message || attempt.error_code || new Date(attempt.started_at).toLocaleString()}`}
                state={attempt.status === "carrier_submitted" ? "success" : attempt.status === "failed" ? "problem" : undefined}
              />
            ))}
            {replies.rows.map((reply: any) => (
              <TimelineItem
                key={reply.id}
                title="Inbound reply matched"
                detail={`${reply.from_number_redacted}: ${reply.body}`}
                state="success"
              />
            ))}
          </div>
        </section>
      </div>
      <div className="grid" style={{ marginTop: 16 }}>
        <section className="panel">
          <h2>Delivery Summary</h2>
          <dl>
            <dt>To</dt><dd>{message.to_number_redacted}</dd>
            <dt>Gateway Used</dt><dd>{message.gateway_name || message.claim_gateway_id || "-"}</dd>
            <dt>Final Status</dt><dd><span className={`status ${message.status}`}>{humanize(message.status)}</span></dd>
            <dt>Last Attempt</dt><dd>{attempts[0]?.started_at ? new Date(attempts[0].started_at).toLocaleString() : "-"}</dd>
          </dl>
        </section>
        <section className="panel">
          <h2>Client & Routing</h2>
          <dl>
            <dt>Client</dt><dd>{message.api_client_name || humanize(message.submitted_via || "dashboard")}</dd>
            <dt>Idempotency Key</dt><dd>{message.idempotency_key || "-"}</dd>
            <dt>Metadata</dt><dd><details className="diagnostic-details"><summary>Raw metadata</summary><pre>{JSON.stringify(message.metadata, null, 2)}</pre></details></dd>
          </dl>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Attempts</h2>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Status</th>
              <th>Gateway</th>
              <th>Error</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((attempt: any) => (
              <tr key={attempt.id}>
                <td>{attempt.attempt_number}</td>
                <td>{humanize(attempt.status)}</td>
                <td>{attempt.gateway_name}</td>
                <td>{attempt.error_message || attempt.error_code || "-"}</td>
                <td>{new Date(attempt.started_at).toLocaleString()}</td>
              </tr>
            ))}
            {!attempts.length ? <tr><td colSpan={5}>No attempts yet.</td></tr> : null}
          </tbody>
        </table>
      </section>
      <div className="grid" style={{ marginTop: 16 }}>
        <section className="panel">
          <h2>Matched replies</h2>
          <table className="table">
            <thead><tr><th>From</th><th>Body</th><th>Callback</th><th>Received</th></tr></thead>
            <tbody>
              {replies.rows.map((reply: any) => (
                <tr key={reply.id}>
                  <td>{reply.from_number_redacted}</td>
                  <td>{reply.body}</td>
                  <td><span className={`status ${reply.callback_status}`}>{humanize(reply.callback_status)}</span></td>
                  <td>{new Date(reply.received_at).toLocaleString()}</td>
                </tr>
              ))}
              {!replies.rows.length ? <tr><td colSpan={4}>No replies matched yet.</td></tr> : null}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2>Callback deliveries</h2>
          <table className="table">
            <thead><tr><th>Status</th><th>Event</th><th>Attempts</th><th>Last result</th></tr></thead>
            <tbody>
              {callbacks.rows.map((callback: any) => (
                <tr key={callback.id}>
                  <td><span className={`status ${callback.status}`}>{humanize(callback.status)}</span></td>
                  <td>{humanize(callback.event_type)}</td>
                  <td>{callback.attempt_count}</td>
                  <td>{callback.last_http_status || callback.last_response || "-"}</td>
                </tr>
              ))}
              {!callbacks.rows.length ? <tr><td colSpan={4}>No callback deliveries.</td></tr> : null}
            </tbody>
          </table>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Quick actions</h2>
        <div className="actions-row" style={{ justifyContent: "flex-start" }}>
          {canRequeue ? (
            <form action={requeueMessageAction}>
              <input type="hidden" name="messageId" value={message.id} />
              <button className="secondary-button" type="submit"><RotateCcw size={16} />Requeue Message</button>
            </form>
          ) : null}
          {canCancel ? (
            <form action={cancelMessageAction}>
              <input type="hidden" name="messageId" value={message.id} />
              <button className="secondary-button danger" type="submit"><Ban size={16} />Cancel Message</button>
            </form>
          ) : null}
          <button className="secondary-button" type="button"><Download size={16} />Download Events</button>
        </div>
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

function TimelineItem({ title, detail, state }: { title: string; detail: string; state?: "success" | "problem" }) {
  return (
    <div className={`timeline-item ${state || ""}`}>
      <div className="timeline-title">{title}</div>
      <div className="object-meta">{detail}</div>
    </div>
  );
}
