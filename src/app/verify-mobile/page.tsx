import Link from "next/link";
import { resendMobileVerificationAction, verifyMobileAction } from "@/app/actions";

export default async function VerifyMobilePage({
  searchParams
}: {
  searchParams: Promise<{ email?: string; sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const email = sp.email || "";
  return (
    <section className="panel login">
      <div className="page-header">
        <div>
          <h1>Verify mobile number</h1>
          <p>Enter the six-digit code sent through your client&apos;s SMS gateway.</p>
        </div>
      </div>
      <form className="form" action={verifyMobileAction}>
        {sp.sent ? <p className="success">If the account is awaiting verification, a code has been queued.</p> : null}
        {sp.error ? <p className="error">{sp.error}</p> : null}
        <div className="field">
          <label htmlFor="verifyEmail">Email</label>
          <input id="verifyEmail" name="email" type="email" required autoComplete="email" defaultValue={email} />
        </div>
        <div className="field">
          <label htmlFor="verificationCode">Verification code</label>
          <input id="verificationCode" name="code" inputMode="numeric" pattern="[0-9]{6}" required autoComplete="one-time-code" />
        </div>
        <button className="primary" type="submit">Verify mobile number</button>
      </form>
      <form className="form" action={resendMobileVerificationAction}>
        <input type="hidden" name="email" value={email} />
        <button className="secondary-button" type="submit">Send another code</button>
      </form>
      <p className="muted auth-footer"><Link href="/login">Back to sign in</Link></p>
    </section>
  );
}
