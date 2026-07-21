import { acceptUserInvitationAction } from "@/app/actions";
import { getPlatformName } from "@/lib/branding";

export default async function InvitationPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const platformName = getPlatformName();

  return (
    <section className="panel login">
      <div className="page-header">
        <div>
          <h1>Accept invitation</h1>
          <p>Set your {platformName} password</p>
        </div>
      </div>
      <form className="form" action={acceptUserInvitationAction}>
        {sp.error ? <p className="error">{sp.error}</p> : null}
        <input type="hidden" name="token" value={token} />
        <div className="field">
          <label htmlFor="mobileNumber">Mobile number</label>
          <input id="mobileNumber" name="mobileNumber" type="tel" required autoComplete="tel" placeholder="+1 555 123 4567" />
          <span className="muted">Used to send one-time password reset codes.</span>
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">Confirm password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required minLength={12} autoComplete="new-password" />
        </div>
        <button className="primary" type="submit">Create account</button>
      </form>
    </section>
  );
}
