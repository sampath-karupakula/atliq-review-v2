import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { can, ROLES, ROLE_HELP, ROLE_LABEL, type Role } from "@/lib/auth/permissions";
import { Kpi, PageHead } from "@/components/ui";
import { NewUserForm, UserRowActions } from "./UserAdmin";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await getCurrentUser();
  if (!can(me, "users.manage")) {
    return (
      <section className="wrap page">
        <PageHead eyebrow="Admin" title="Users" />
        <div className="stub">
          <p>Only an admin manages users.</p>
        </div>
      </section>
    );
  }
  const rows = await getDb().select().from(users).orderBy(asc(users.name));
  const now = Date.now();
  return (
    <section className="wrap page">
      <PageHead eyebrow="Admin" title="Users" aside={<NewUserForm />} />
      <p className="muted" style={{ maxWidth: "68ch" }}>
        Who can sign in, and what each role can do. New people get a one-time temporary password.
      </p>
      <div className="kpis">
        {ROLES.map((r) => (
          <Kpi key={r} value={rows.filter((u) => u.role === r && u.active).length} label={ROLE_LABEL[r]} sub={ROLE_HELP[r]} />
        ))}
      </div>
      {rows.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const locked = u.lockedUntil && u.lockedUntil.getTime() > now;
                return (
                  <tr key={u.id} style={u.active ? undefined : { opacity: 0.6 }}>
                    <td className="co">
                      {u.name}
                      {u.id === me.id ? <span className="hint"> (you)</span> : null}
                      <small>{u.email}</small>
                    </td>
                    <td>{ROLE_LABEL[u.role as Role] ?? u.role}</td>
                    <td>
                      {!u.active ? (
                        <span className="muted">Deactivated</span>
                      ) : locked ? (
                        <span style={{ color: "var(--serious)" }}>Locked (too many wrong passwords)</span>
                      ) : u.mustChangePassword ? (
                        <span style={{ color: "var(--nego)" }}>Temporary password</span>
                      ) : (
                        <span style={{ color: "var(--ok)" }}>Active</span>
                      )}
                    </td>
                    <td className="num muted">{u.lastLoginAt ? u.lastLoginAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Never"}</td>
                    <td>
                      <UserRowActions id={u.id} name={u.name} role={u.role as Role} active={u.active} isMe={u.id === me.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="stub">
          <p>No accounts yet. Set SEED_USER_PASSWORD and run pnpm seed:users to create AtliQ&apos;s accounts, or add a person.</p>
        </div>
      )}
      <p className="hint">Accounts are never deleted, so the activity log keeps its history. Deactivate someone who leaves; they are signed out at once.</p>
    </section>
  );
}
