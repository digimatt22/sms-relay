import Link from "next/link";

export default function ConsentCompletePage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Authorization complete</p>
        <h1>Your mobile number is verified</h1>
        <p>You can now receive the messages you requested. Reply STOP at any time to opt out.</p>
        <Link className="button secondary" href="/">Done</Link>
      </section>
    </main>
  );
}
