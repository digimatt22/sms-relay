import { notFound } from "next/navigation";
import Link from "next/link";
import { Ban, Download, MessageCircleReply, RotateCcw, Send } from "lucide-react";
import type { ReactNode } from "react";
import { LocalDateTime } from "@/components/local-date-time";
import { ConversationThread } from "@/app/messages/[id]/conversation-thread";
import { requireAdminPage } from "@/lib/page-auth";
import { getMessage, listPhoneConversation } from "@/lib/messages";
import { humanize } from "@/lib/format";
import { cancelMessageAction, requeueMessageAction } from "@/app/actions";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { hasRole } from "@/lib/rbac";
import { query } from "@/lib/db";

export default async function MessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage();
  const { id } = await params;
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const { message, attempts, deliveryReceipts } = await getMessage(id);
  if (!message || message.organization_id !== organizationId) notFound();
  const [replies, callbacks, conversation] = await Promise.all([
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
    ),
    listPhoneConversation(organizationId, message.to_number, message.conversation_thread_id)
  ]);
  const canOperate = hasRole(session, "operator");
  const canCancel = canOperate && ["queued", "retry_scheduled", "claimed"].includes(message.status);
  const canRequeue = canOperate && !["carrier_submitted", "delivery_confirmed", "delivery_failed", "delivery_unknown"].includes(message.status);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="muted"><Link href="/messages">Back to Messages</Link></p>
          <h1>Message {message.id}</h1>
          <p>Created <LocalDateTime value={message.created_at} /> · Source: {message.api_client_name || humanize(message.submitted_via || "dashboard")}</p>
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
        <MetricCard label="Delivery reports" value={deliveryReceipts.length} note={message.delivery_status || "Awaiting carrier receipt"} />
      </section>

      <div className="route-card-grid">
        <section className="panel">
          <h2>Conversation</h2>
          <p className="muted conversation-summary">All messages with {message.to_number_redacted}</p>
          <ConversationThread>
            {conversation.map((item: any) => {
              const selected = item.direction === "outbound" && item.id === message.id;
              return (
                <div
                  className={`conversation-bubble ${item.direction}${selected ? " selected" : ""}`}
                  data-selected-message={selected ? "true" : undefined}
                  key={`${item.direction}-${item.id}`}
                >
                  <div className="conversation-label">
                    {item.direction === "outbound" ? <Send size={17} color="#009688" /> : <MessageCircleReply size={17} color="#2563eb" />}
                    {item.direction === "outbound" ? "Outbound" : "Inbound"}
                    <span className={`status ${item.direction === "outbound" ? item.status : item.callback_status}`}>
                      {humanize(item.direction === "outbound" ? item.status : item.callback_status)}
                    </span>
                    {selected ? <span className="selected-message-label">Selected message</span> : null}
                  </div>
                  <div>{item.body}</div>
                  <div className="object-meta">
                    {item.direction === "outbound" ? (
                      <>To: {item.to_number_redacted} · Client: {item.api_client_name || humanize(item.submitted_via || "dashboard")} · <LocalDateTime value={item.occurred_at} /></>
                    ) : (
                      <>From: {item.from_number_redacted} · Gateway: {item.gateway_name || "-"} · <LocalDateTime value={item.occurred_at} /></>
                    )}
                  </div>
                  {item.direction === "outbound" && !selected ? <Link className="conversation-message-link" href={`/messages/${item.id}`}>Open message details</Link> : null}
                </div>
              );
            })}
          </ConversationThread>
        </section>
        <section className="panel">
          <h2>Message Lifecycle</h2>
          <div className="timeline">
            <TimelineItem title="Created" detail={<LocalDateTime value={message.created_at} />} state="success" />
            {attempts.map((attempt: any) => (
              <TimelineItem
                key={attempt.id}
                title={`Attempt ${attempt.attempt_number}: ${humanize(attempt.status)}`}
                detail={<>{attempt.gateway_name || "Unknown gateway"} · {attempt.error_message || attempt.error_code || <LocalDateTime value={attempt.started_at} />}</>}
                state={attempt.status === "carrier_submitted" ? "success" : attempt.status === "failed" ? "problem" : undefined}
              />
            ))}
            {deliveryReceipts.map((receipt: any) => (
              <TimelineItem
                key={receipt.id}
                title={`Delivery: ${humanize(receipt.normalized_status)}`}
                detail={<>Carrier code {receipt.status_code} · <LocalDateTime value={receipt.received_at} /></>}
                state={receipt.normalized_status === "delivered" ? "success" : receipt.normalized_status === "undelivered" ? "problem" : undefined}
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
            <dt>Carrier Delivery</dt><dd>{message.delivery_status ? humanize(message.delivery_status) : "Awaiting report"}</dd>
            <dt>Delivered At</dt><dd>{message.delivered_at ? <LocalDateTime value={message.delivered_at} /> : "-"}</dd>
            <dt>Last Attempt</dt><dd>{attempts[0]?.started_at ? <LocalDateTime value={attempts[0].started_at} /> : "-"}</dd>
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
                <td><LocalDateTime value={attempt.started_at} /></td>
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
                  <td><LocalDateTime value={reply.received_at} /></td>
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

function TimelineItem({ title, detail, state }: { title: string; detail: ReactNode; state?: "success" | "problem" }) {
  return (
    <div className={`timeline-item ${state || ""}`}>
      <div className="timeline-title">{title}</div>
      <div className="object-meta">{detail}</div>
    </div>
  );
}
