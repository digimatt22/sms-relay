import { notFound } from "next/navigation";
import { confirmHostedAuthorizationAction } from "@/app/actions";
import { getMessagingProgram } from "@/lib/messaging-programs";
import { getRecipientAuthorization } from "@/lib/recipient-authorizations";

export default async function VerifyRecipientPage({
  params,
  searchParams
}: {
  params: Promise<{ programId: string }>;
  searchParams: Promise<{ authorizationId?: string; error?: string }>;
}) {
  const { programId } = await params;
  const query = await searchParams;
  const program = await getMessagingProgram(programId, { activeOnly: true });
  const authorization = query.authorizationId ? await getRecipientAuthorization(query.authorizationId) : null;
  if (!program || !authorization || authorization.messaging_program_id !== program.id) notFound();

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Verify your number</p>
        <h1>Enter the six-digit code</h1>
        <p>We sent a code to {authorization.phone_number_redacted} for {program.sender_display_name}.</p>
        {query.error ? <div className="notice error">{query.error}</div> : null}
        <form className="form" action={confirmHostedAuthorizationAction}>
          <input type="hidden" name="programId" value={program.id} />
          <input type="hidden" name="authorizationId" value={authorization.id} />
          <div className="field">
            <label htmlFor="code">Verification code</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
          </div>
          <button className="primary" type="submit">Verify and authorize</button>
        </form>
      </section>
    </main>
  );
}
