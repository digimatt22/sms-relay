import { requireRolePage } from "@/lib/page-auth";
import { createMessageAction } from "@/app/actions";
import { getAccountContext } from "@/lib/account-context";
import { listMessagingPrograms } from "@/lib/messaging-programs";

export default async function NewMessagePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireRolePage("operator");
  const account = await getAccountContext(session);
  const programs = await listMessagingPrograms({ organizationId: account.organizationId, activeOnly: true });
  const params = await searchParams;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Send message</h1>
          <p>Create an outbound SMS for gateway pickup</p>
        </div>
      </header>
      <section className="panel">
        {params.error ? <div className="notice error">{params.error}</div> : null}
        <form className="form" action={createMessageAction}>
          <div className="field">
            <label htmlFor="programId">Messaging Program</label>
            <small className="field-help">The recipient must be verified and authorized for this program.</small>
            <select id="programId" name="programId" required defaultValue="">
              <option value="" disabled>Select a program</option>
              {programs.map((program: any) => <option key={program.id} value={program.id}>{program.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input
              id="to"
              name="to"
              placeholder="+15551234567 or (555) 123-4567"
              autoComplete="tel"
              inputMode="tel"
              pattern="[\s()+.\-–—0-9]+"
              title="Use E.164 like +15551234567 or a 10-digit US number. Extensions and letters are not supported."
              required
            />
          </div>
          <div className="field">
            <label htmlFor="body">Body</label>
            <textarea id="body" name="body" required />
          </div>
          <div className="grid">
            <div className="field">
              <label htmlFor="priority">Priority</label>
              <input id="priority" name="priority" type="number" defaultValue="100" />
            </div>
            <div className="field">
              <label htmlFor="scheduledAt">Scheduled at</label>
              <input id="scheduledAt" name="scheduledAt" type="datetime-local" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="idempotencyKey">Idempotency key</label>
            <input id="idempotencyKey" name="idempotencyKey" />
          </div>
          <div className="field">
            <label htmlFor="callbackUrl">Callback URL</label>
            <input id="callbackUrl" name="callbackUrl" type="url" />
          </div>
          <div className="field">
            <label htmlFor="metadata">Metadata JSON</label>
            <textarea id="metadata" name="metadata" defaultValue='{"customerRef":""}' />
          </div>
          <button className="primary" type="submit">Create message</button>
        </form>
      </section>
    </>
  );
}
