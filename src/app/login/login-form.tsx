"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions";

export default function LoginForm({ passwordChanged }: { passwordChanged: boolean }) {
  const [error, formAction, pending] = useActionState(loginAction, null);

  return (
    <section className="panel login">
      <div className="page-header">
        <div>
          <h1>RelayHub SMS</h1>
          <p>Admin sign in</p>
        </div>
      </div>
      <form className="form" action={formAction}>
        {passwordChanged ? <p className="success">Password updated. Sign in with your new password.</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </section>
  );
}
