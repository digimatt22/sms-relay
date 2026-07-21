import { acceptUserInvitationAction } from "@/app/actions";

export default async function InvitationPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  return (
    <section className="panel login">
      <div className="page-header">
        <div>
          <h1>Accept invitation</h1>
          <p>Set your RelayHub SMS password</p>
        </div>
      </div>
      <form className="form" action={acceptUserInvitationAction}>
        {sp.error ? <p className="error">{sp.error}</p> : null}
        <input type="hidden" name="token" value={token} />
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">Confirm password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <button className="primary" type="submit">Create account</button>
      </form>
    </section>
  );
}
