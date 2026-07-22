import Link from "next/link";
import type React from "react";
import { LocalDateTime } from "@/components/local-date-time";
import { requireAdminPage } from "@/lib/page-auth";
import { listMessages } from "@/lib/messages";
import { humanize } from "@/lib/format";
import { getCurrentOrganizationId } from "@/lib/organizations";
import { ClickableMessageRow } from "@/app/messages/clickable-message-row";

export default async function MessagesPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; sort?: string; direction?: string }>;
}) {
  const session = await requireAdminPage();
  const params = await searchParams;
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const messages = sortMessages(await listMessages(params.status, { organizationId }), params.sort, params.direction);
  const filterStatuses = [
    ["", "All"],
    ["queued", "Queued"],
    ["sending", "Sending"],
    ["retry_scheduled", "Retry"],
    ["carrier_submitted", "Submitted"],
    ["dead_lettered", "Dead Lettered"]
  ];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Message Queue</h1>
          <p>List view for outbound messages. Use Command Center for queue health and operational summaries.</p>
        </div>
      </header>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="relationship-row" style={{ justifyContent: "space-between" }}>
          <div className="relationship-row">
            {filterStatuses.map(([status, label]) => (
              <Link
                className={`chip ${params.status === status || (!params.status && !status) ? "good" : ""}`}
                href={status ? `/messages?status=${status}` : "/messages"}
                key={status || "all"}
              >
                {label}
              </Link>
            ))}
          </div>
          <span className="muted">{messages.length} message(s)</span>
        </div>
      </section>

      <section className="panel desktop-only">
        <table className="table">
          <thead>
            <tr>
              <th><SortLink field="status" current={params}>Status</SortLink></th>
              <th><SortLink field="to" current={params}>To</SortLink></th>
              <th>Body</th>
              <th><SortLink field="source" current={params}>Source</SortLink></th>
              <th>Gateway</th>
              <th><SortLink field="attempts" current={params}>Attempts</SortLink></th>
              <th><SortLink field="created" current={params}>Created</SortLink></th>
            </tr>
          </thead>
          <tbody>
            {messages.map((message: any) => (
              <ClickableMessageRow
                href={`/messages/${message.id}`}
                key={message.id}
                label={`Open message to ${message.to_number_redacted}`}
              >
                <td><span className={`status ${message.status}`}>{humanize(message.status)}</span></td>
                <td>{message.to_number_redacted}</td>
                <td>{message.body}</td>
                <td>{message.api_client_name || humanize(message.submitted_via || "dashboard")}</td>
                <td>{message.gateway_name || "-"}</td>
                <td>{message.attempt_count}</td>
                <td><LocalDateTime value={message.created_at} /></td>
              </ClickableMessageRow>
            ))}
            {!messages.length ? (
              <tr><td colSpan={7}>No messages yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
      <section className="mobile-only mobile-card-list" aria-label="Message queue mobile list">
        {messages.map((message: any) => (
          <Link className="mobile-card" href={`/messages/${message.id}`} key={message.id}>
            <div className="mobile-card-main">
              <div>
                <div className="mobile-card-title">{message.to_number_redacted}</div>
                <div className="mobile-card-body">{message.body}</div>
              </div>
              <span className={`status ${message.status}`}>{humanize(message.status)}</span>
            </div>
            <div className="mobile-card-meta">
              <span>Source: {message.api_client_name || humanize(message.submitted_via || "dashboard")}</span>
              <span>Gateway: {message.gateway_name || "-"}</span>
              <span>Attempts: {message.attempt_count}</span>
              <span><LocalDateTime value={message.created_at} /></span>
            </div>
          </Link>
        ))}
        {!messages.length ? <p className="muted">No messages yet.</p> : null}
      </section>
    </>
  );
}

function SortLink({
  field,
  current,
  children
}: {
  field: string;
  current: { status?: string; sort?: string; direction?: string };
  children: React.ReactNode;
}) {
  const nextDirection = current.sort === field && current.direction !== "desc" ? "desc" : "asc";
  const params = new URLSearchParams();
  if (current.status) params.set("status", current.status);
  params.set("sort", field);
  params.set("direction", nextDirection);
  return <Link href={`/messages?${params.toString()}`}>{children}</Link>;
}

function sortMessages(messages: any[], sort = "created", direction = "desc") {
  const multiplier = direction === "asc" ? 1 : -1;
  const valueFor = (message: any) => {
    if (sort === "status") return message.status || "";
    if (sort === "to") return message.to_number_redacted || "";
    if (sort === "source") return message.api_client_name || message.submitted_via || "";
    if (sort === "attempts") return Number(message.attempt_count || 0);
    return new Date(message.created_at).getTime();
  };
  return [...messages].sort((a, b) => {
    const av = valueFor(a);
    const bv = valueFor(b);
    if (av < bv) return -1 * multiplier;
    if (av > bv) return 1 * multiplier;
    return 0;
  });
}
