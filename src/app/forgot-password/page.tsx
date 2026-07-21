import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions";

export default function ForgotPasswordPage() {
  return (
    <section className="panel login">
      <div className="page-header">
        <div>
          <h1>Reset password</h1>
          <p>We will text a one-time code to the mobile number on your account.</p>
        </div>
      </div>
      <form className="form" action={requestPasswordResetAction}>
        <div className="field">
          <label htmlFor="resetEmail">Email</label>
          <input id="resetEmail" name="email" type="email" required autoComplete="email" />
        </div>
        <button className="primary" type="submit">Send reset code</button>
        <p className="muted"><Link href="/login">Back to sign in</Link></p>
      </form>
    </section>
  );
}
