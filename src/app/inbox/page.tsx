import Link from "next/link";
import { requireAdminPage } from "@/lib/page-auth";
import { listInboundMessages } from "@/lib/inbound";
import { humanize } from "@/lib/format";
import { getCurrentOrganizationId } from "@/lib/organizations";

export default async function InboxPage() {
  const session = await requireAdminPage();
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const messages = await listInboundMessages({ organizationId });

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Inbox</h1>
          <p>Inbound SMS replies and callback status</p>
        </div>
      </header>
      <table className="table">
        <thead>
          <tr>
            <th>From</th>
            <th>Body</th>
            <th>Gateway</th>
            <th>Callback</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((message: any) => (
            <tr key={message.id}>
              <td><Link href={`/inbox/${message.id}`}>{message.from_number_redacted}</Link></td>
              <td>{message.body}</td>
              <td>{message.gateway_name || "-"}</td>
              <td><span className={`status ${message.callback_status}`}>{humanize(message.callback_status)}</span></td>
              <td>{new Date(message.received_at).toLocaleString()}</td>
            </tr>
          ))}
          {!messages.length ? (
            <tr><td colSpan={5}>No inbound messages yet.</td></tr>
          ) : null}
        </tbody>
      </table>
    </>
  );
}
