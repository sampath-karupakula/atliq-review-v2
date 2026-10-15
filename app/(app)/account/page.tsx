import type { Metadata } from "next";
import Link from "next/link";
import { PageHead, Panel } from "@/components/ui";
import { getCurrentUser, sessionsOf } from "@/lib/auth/session";
import { ROLE_HELP, ROLE_LABEL } from "@/lib/auth/permissions";
import { ChangePasswordForm, SignOutButton, SignOutOthersButton } from "./AccountForms";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const [{ first }, me] = await Promise.all([searchParams, getCurrentUser()]);
  const mine = me.demo ? [] : (await sessionsOf(me.id)).sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  return (
    <section className="wrap page">
      <PageHead eyebrow="Account" title={me.name} aside={me.demo ? null : <SignOutButton />} />
      {first || me.mustChangePassword ? (
        <p role="alert" className="warnline">
          You signed in with a temporary password. Choose your own password to continue.
        </p>
      ) : null}
      {me.demo ? (
        <p className="warnline">
          Demo mode: you&apos;re viewing as {me.name} without signing in. <Link href="/login">Sign in</Link> with your own account to manage a password.
        </p>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 18 }}>
        <Panel title="You">
          <ul className="mini-list">
            <li>
              <span className="hint">Name</span>
              <span>{me.name}</span>
            </li>
            <li>
              <span className="hint">Email</span>
              <span>{me.email}</span>
            </li>
            <li style={{ display: "block" }}>
              <span className="hint">Role</span>
              <b style={{ display: "block" }}>{ROLE_LABEL[me.role]}</b>
              <span className="hint">{ROLE_HELP[me.role]}</span>
            </li>
          </ul>
          <p className="hint">Only an admin can change your name, email or role.</p>
        </Panel>
        {me.demo ? null : (
          <Panel title="Change password">
            <ChangePasswordForm />
          </Panel>
        )}
      </div>
      {me.demo ? null : (
        <Panel title={`Where you're signed in (${mine.length})`} aside={mine.length > 1 ? <SignOutOthersButton /> : undefined}>
          <ul className="mini-list">
            {mine.map((s) => (
              <li key={s.id}>
                <span>{describeAgent(s.userAgent)}</span>
                <span className="hint">
                  {s.id === me.sessionId ? "This device · " : ""}last active {s.lastSeenAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </section>
  );
}

function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown browser";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}
