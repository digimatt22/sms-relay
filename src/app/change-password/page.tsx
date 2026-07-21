"use client";

import { useActionState } from "react";
import { changeRequiredPasswordAction } from "@/app/actions";

export default function ChangePasswordPage() {
  const [error, formAction, pending] = useActionState(changeRequiredPasswordAction, null);

  return (
    <section className="panel login">
      <div className="page-header">
        <div>
          <h1>Choose a new password</h1>
          <p>Your temporary password must be changed before you can use RelayHub SMS.</p>
        </div>
      </div>
      <form className="form" action={formAction}>
        {error ? <p className="error">{error}</p> : null}
        <div className="field">
          <label htmlFor="password">New password</label>
          <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" />
          <small>Use at least 12 characters.</small>
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">Confirm new password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required minLength={12} autoComplete="new-password" />
        </div>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? "Updating password..." : "Update password"}
        </button>
      </form>
    </section>
  );
}
