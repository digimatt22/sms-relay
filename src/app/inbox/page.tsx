import Link from "next/link";
import { requireAdminPage } from "@/lib/page-auth";
import { listInboundGateways, listInboundMessages } from "@/lib/inbound";
import { humanize } from "@/lib/format";
import { getCurrentOrganizationId } from "@/lib/organizations";

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
}

export default async function InboxPage({
  searchParams
}: {
  searchParams: Promise<{ gateway?: string; from?: string; to?: string; sort?: string }>;
}) {
  const session = await requireAdminPage();
  const organizationId = await getCurrentOrganizationId({ userId: session.user.id, role: session.user.role });
  const params = await searchParams;
  const gatewayId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.gateway || "")
    ? params.gateway || ""
    : "";
  const fromDate = validDate(params.from);
  const toDate = validDate(params.to);
  const sort = params.sort === "oldest" ? "oldest" : "newest";
  const [messages, gateways] = await Promise.all([
    listInboundMessages({ organizationId, gatewayId, fromDate, toDate, sort }),
    listInboundGateways(organizationId)
  ]);
  const receivedSort = sort === "newest" ? "oldest" : "newest";
  const receivedSortParams = new URLSearchParams();
  if (gatewayId) receivedSortParams.set("gateway", gatewayId);
  if (fromDate) receivedSortParams.set("from", fromDate);
  if (toDate) receivedSortParams.set("to", toDate);
  receivedSortParams.set("sort", receivedSort);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Inbox</h1>
          <p>Inbound SMS replies and callback status</p>
        </div>
      </header>
      <section className="panel inbox-filters">
        <form method="get" className="filter-form">
          <div className="field">
            <label htmlFor="inbox-from">From date</label>
            <input id="inbox-from" name="from" type="date" defaultValue={fromDate} />
          </div>
          <div className="field">
            <label htmlFor="inbox-to">To date</label>
            <input id="inbox-to" name="to" type="date" defaultValue={toDate} />
          </div>
          <div className="field">
            <label htmlFor="inbox-gateway">Gateway</label>
            <select id="inbox-gateway" name="gateway" defaultValue={gatewayId}>
              <option value="">All gateways</option>
              {gateways.map((gateway: any) => <option key={gateway.id} value={gateway.id}>{gateway.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="inbox-sort">Received</label>
            <select id="inbox-sort" name="sort" defaultValue={sort}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
          <div className="filter-actions">
            <button className="primary" type="submit">Apply filters</button>
            <Link className="button secondary" href="/inbox">Clear</Link>
          </div>
        </form>
      </section>
      <table className="table">
        <thead>
          <tr>
            <th>From</th>
            <th>Body</th>
            <th>Gateway</th>
            <th>Callback</th>
            <th><Link href={`/inbox?${receivedSortParams.toString()}`}>Received {sort === "newest" ? "↓" : "↑"}</Link></th>
          </tr>
        </thead>
        <tbody>
          {messages.map((message: any) => (
            <tr className={message.read_at ? undefined : "inbox-unread"} key={message.id}>
              <td>
                {!message.read_at ? <span className="unread-dot" aria-label="Unread" /> : null}
                <Link href={`/inbox/${message.id}`} prefetch={false}>{message.from_number_redacted}</Link>
              </td>
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
