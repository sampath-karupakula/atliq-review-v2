"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, signOut, signOutOtherDevices } from "@/app/actions/auth";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label className="fl">
        <span>Current password</span>
        <input name="current" type="password" required autoComplete="current-password" />
      </label>
      <label className="fl">
        <span>New password</span>
        <input name="next" type="password" required minLength={10} autoComplete="new-password" aria-describedby="pw-rules" />
        <span id="pw-rules" className="hint" style={{ fontWeight: 400 }}>
          At least 10 characters. A few unrelated words work well, e.g. three words and a number.
        </span>
      </label>
      <label className="fl">
        <span>Repeat the new password</span>
        <input name="confirm" type="password" required minLength={10} autoComplete="new-password" />
      </label>
      {state?.error ? (
        <p role="alert" className="err" style={{ margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" style={{ margin: 0, color: "var(--ok)" }}>
          {state.ok}
        </p>
      ) : null}
      <div>
        <button type="submit" disabled={pending} className="btn primary small">
          {pending ? "Saving…" : "Change password"}
        </button>
      </div>
    </form>
  );
}

export function SignOutOthersButton() {
  const [state, action, pending] = useActionState(signOutOtherDevices, null);
  return (
    <form action={action} className="dismiss-row">
      {state?.ok ? <span className="hint">{state.ok}</span> : null}
      {state?.error ? <span className="err">{state.error}</span> : null}
      <button type="submit" disabled={pending} className="btn small">
        Sign out other devices
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="btn small quiet">
        Sign out
      </button>
    </form>
  );
}
