"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, UserPlus } from "lucide-react";
import { createUser, resetPassword, setActive, setRole } from "@/app/actions/users";
import { ROLES, ROLE_HELP, ROLE_LABEL, type Role } from "@/lib/auth/permissions";
import { btn } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";

const field = "min-h-9 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm";

/** Shows a temporary password once, with a copy button. It is not stored anywhere readable. */
function TempPassword({ name, password, onDone }: { name: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <ConfirmDialog open title={`Temporary password for ${name}`} confirmLabel="Done" onConfirm={onDone} onCancel={onDone}>
      <p>Give this to {name} privately. It works once: they must choose their own password when they sign in. It won&rsquo;t be shown again.</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-base text-fg">{password}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(password).then(() => setCopied(true));
          }}
          className={btn("secondary", "sm")}
        >
          <Copy className="size-4" aria-hidden /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </ConfirmDialog>
  );
}

export function NewUserForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRoleValue] = useState<Role>("reviewer");
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await createUser({ name, email, role });
      if (r.ok && r.tempPassword) {
        setOpen(false);
        setCreated({ name, password: r.tempPassword });
        setName("");
        setEmail("");
        toast(`Account created for ${name}.`);
      } else if (!r.ok) setError(r.error);
    });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btn("primary", "sm")}>
        <UserPlus className="size-4" aria-hidden /> Add a person
      </button>
      <ConfirmDialog open={open} title="Add a person" confirmLabel={pending ? "Creating…" : "Create account"} confirmDisabled={pending || !name.trim() || !email.trim()} onCancel={() => setOpen(false)} onConfirm={submit}>
        <div className="grid gap-3 text-fg">
          <label className="grid gap-1 text-sm font-medium">
            Name (shown everywhere, e.g. as deal owner)
            <input value={name} onChange={(e) => setName(e.target.value)} required className={field} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Email (used to sign in)
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className={field} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Role
            <select value={role} onChange={(e) => setRoleValue(e.target.value as Role)} className={field}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-muted">{ROLE_HELP[role]}</span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-serious">
              {error}
            </p>
          )}
        </div>
      </ConfirmDialog>
      {created && <TempPassword name={created.name} password={created.password} onDone={() => setCreated(null)} />}
    </>
  );
}

export function UserRowActions({ id, name, role, active, isMe }: { id: string; name: string; role: Role; active: boolean; isMe: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<null | "deactivate" | "reset">(null);
  const [temp, setTemp] = useState<string | null>(null);
  const { toast } = useToast();
  const done = (r: { ok: boolean; error?: string }, msg: string) => toast(r.ok ? msg : (r.error ?? "Not allowed."), { tone: r.ok ? "ok" : "error" });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`Role for ${name}`}
        value={role}
        disabled={pending || !active}
        onChange={(e) => {
          const next = e.target.value as Role;
          start(async () => done(await setRole(id, next), `${name} is now ${ROLE_LABEL[next]}.`));
        }}
        className="min-h-8 rounded-md border border-line bg-surface px-2 text-sm"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <button type="button" disabled={pending} onClick={() => setConfirm("reset")} className={btn("quiet", "sm")}>
        <KeyRound className="size-3.5" aria-hidden /> Reset password
      </button>
      {active ? (
        <button type="button" disabled={pending || isMe} title={isMe ? "You can't deactivate yourself" : undefined} onClick={() => setConfirm("deactivate")} className={btn("quiet", "sm")}>
          Deactivate
        </button>
      ) : (
        <button type="button" disabled={pending} onClick={() => start(async () => done(await setActive(id, true), `${name} can sign in again.`))} className={btn("quiet", "sm")}>
          Reactivate
        </button>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "reset" ? `Reset ${name}'s password?` : `Deactivate ${name}?`}
        confirmLabel={confirm === "reset" ? "Reset password" : "Deactivate"}
        tone={confirm === "deactivate" ? "danger" : "primary"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const what = confirm;
          setConfirm(null);
          start(async () => {
            if (what === "reset") {
              const r = await resetPassword(id);
              if (r.ok && r.tempPassword) setTemp(r.tempPassword);
              else done(r, "");
            } else {
              done(await setActive(id, false), `${name} was deactivated and signed out everywhere.`);
            }
          });
        }}
      >
        {confirm === "reset" ? (
          <p>{name} is signed out everywhere and gets a one-time temporary password, which you&rsquo;ll see next.</p>
        ) : (
          <p>{name} is signed out at once and can&rsquo;t sign in until reactivated. Their history stays in the activity log.</p>
        )}
      </ConfirmDialog>
      {temp && <TempPassword name={name} password={temp} onDone={() => setTemp(null)} />}
    </div>
  );
}
