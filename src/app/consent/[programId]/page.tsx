import { notFound } from "next/navigation";
import { requestHostedAuthorizationAction } from "@/app/actions";
import { getMessagingProgram } from "@/lib/messaging-programs";

export default async function HostedConsentPage({
  params,
  searchParams
}: {
  params: Promise<{ programId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { programId } = await params;
  const query = await searchParams;
  const program = await getMessagingProgram(programId, { activeOnly: true });
  if (!program || !program.public_enrollment_enabled) notFound();

  return (
    <main className="auth-shell">
      <section className="auth-card" style={{ maxWidth: 620 }}>
        <p className="eyebrow">SMS authorization</p>
        <h1>{program.name}</h1>
        <p>{program.purpose}</p>
        {query.error ? <div className="notice error">{query.error}</div> : null}
        <form className="form" action={requestHostedAuthorizationAction}>
          <input type="hidden" name="programId" value={program.id} />
          <div className="field">
            <label htmlFor="phoneNumber">Mobile number</label>
            <input id="phoneNumber" name="phoneNumber" type="tel" inputMode="tel" autoComplete="tel" required placeholder="+15551234567" />
          </div>
          <label className="relationship-row" style={{ alignItems: "flex-start" }}>
            <input type="checkbox" name="recipientInitiated" value="yes" required />
            <span>{program.disclosure_text}</span>
          </label>
          <button className="primary" type="submit">Send verification code</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>Messages are sent for {program.sender_display_name}. Help: {program.help_contact}</p>
      </section>
    </main>
  );
}
