"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { signIn } from "@/app/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  const [show, setShow] = useState(false);
  // Controlled, so a wrong password (React resets the form after the action) doesn't clear the email too.
  const [email, setEmail] = useState("");
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input type="hidden" name="next" value={next} />
      <label className="fl">
        <span>Email</span>
        <input name="email" type="email" required autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!state?.error} />
      </label>
      <label className="fl">
        <span>Password</span>
        <span style={{ position: "relative", display: "block" }}>
          <input
            name="password"
            type={show ? "text" : "password"}
            required
            autoComplete="current-password"
            style={{ paddingRight: 44 }}
            aria-invalid={!!state?.error}
            aria-describedby={state?.error ? "login-error" : undefined}
          />
          <button type="button" className="btn quiet small" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}>
            {show ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        </span>
      </label>
      {state?.error ? (
        <p id="login-error" role="alert" className="warnline" style={{ margin: 0, background: "var(--serious-soft)", color: "var(--serious)" }}>
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn primary">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
