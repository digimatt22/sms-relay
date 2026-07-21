import Link from "next/link";
import { resetPasswordAction } from "@/app/actions";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string; sent?: string; error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <section className="panel login">
      <div className="page-header">
        <div>
          <h1>Enter reset code</h1>
          <p>Use the six-digit code sent through your client&apos;s SMS gateway.</p>
        </div>
      </div>
      <form className="form" action={resetPasswordAction}>
        {sp.sent ? <p className="success">If the account has a mobile number, a reset code has been queued.</p> : null}
        {sp.error ? <p className="error">{sp.error}</p> : null}
        <div className="field">
          <label htmlFor="resetEmail">Email</label>
          <input id="resetEmail" name="email" type="email" required autoComplete="email" defaultValue={sp.email || ""} />
        </div>
        <div className="field">
          <label htmlFor="resetCode">Reset code</label>
          <input id="resetCode" name="code" inputMode="numeric" pattern="[0-9]{6}" required autoComplete="one-time-code" />
        </div>
        <div className="field">
          <label htmlFor="newPassword">New password</label>
          <input id="newPassword" name="password" type="password" required minLength={12} autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">Confirm password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required minLength={12} autoComplete="new-password" />
        </div>
        <button className="primary" type="submit">Reset password</button>
        <p className="muted"><Link href="/forgot-password">Send another code</Link></p>
      </form>
    </section>
  );
}
