import "server-only";
// Who is acting. A signed-in database session always wins. The cookie holds a random 32-byte token and the
// database stores only its SHA-256, so a leaked database can't be used to sign in; sessions last 30 days and slide
// forward when used. With DEMO_MODE=1 and no session, the "Viewing as" cookie picks a demo person instead
// (Karandeep the admin, Bhavin a reviewer, Counsel read-only), so the demo works without passwords.
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { demoMode } from "@/lib/config";
import { isRole, ROLE_COOKIE, ROLES } from "@/lib/roles";
import { can, refusal, type Action, type Context, type Role } from "./permissions";

export const SESSION_COOKIE = "atliq_session";
const SESSION_DAYS = 30;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export type CurrentUser = { id: string; name: string; email: string; role: Role; mustChangePassword: boolean; sessionId: string; demo: boolean };

const DEMO_ROLE = { ceo: "admin", reviewer: "reviewer", counsel: "viewer" } as const;

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await getDb().insert(sessions).values({ id: hashToken(token), userId, expiresAt, userAgent: ua });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
  // Housekeeping: drop expired sessions now and then.
  if (Math.random() < 0.1) await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

async function demoUser(): Promise<CurrentUser> {
  const v = (await cookies()).get(ROLE_COOKIE)?.value;
  const r = isRole(v) ? v : "ceo";
  const name = ROLES[r].name;
  const [u] = await getDb().select().from(users).where(eq(users.name, name));
  return { id: u?.id ?? `demo-${r}`, name, email: u?.email ?? `${name.toLowerCase()}@atliq.test`, role: DEMO_ROLE[r], mustChangePassword: false, sessionId: `demo-${r}`, demo: true };
}

/** The acting user for this request, or null when signed out. Cached per request. */
export const getSessionUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    const id = hashToken(token);
    const [row] = await getDb()
      .select({ s: sessions, u: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
    if (row && row.u.active) {
      // Slide the session at most once an hour.
      if (Date.now() - row.s.lastSeenAt.getTime() > 3_600_000) {
        await getDb()
          .update(sessions)
          .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) })
          .where(eq(sessions.id, id));
      }
      return { id: row.u.id, name: row.u.name, email: row.u.email, role: row.u.role as Role, mustChangePassword: row.u.mustChangePassword, sessionId: id, demo: false };
    }
  }
  return demoMode() ? demoUser() : null;
});

/** For pages: the acting user, or a redirect to sign in (or to /account to replace a temporary password). */
export async function getCurrentUser(): Promise<CurrentUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (u.mustChangePassword && (await headers()).get("x-pathname") !== "/account") redirect("/account?first=1");
  return u;
}

export const requireUser = getCurrentUser;

export class PermissionError extends Error {}

/** For actions and routes: the acting user if allowed to do `action`, else a PermissionError. */
export async function authorize(action: Action, ctx: Context = {}): Promise<CurrentUser> {
  const u = await getSessionUser();
  if (!u) throw new PermissionError("Your session has ended. Sign in again.");
  if (u.mustChangePassword) throw new PermissionError("Choose your own password first (Account page).");
  if (!can(u, action, ctx)) throw new PermissionError(refusal(action, ctx));
  return u;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

/** Sign out everywhere else (after a password change). */
export async function destroyOtherSessions(userId: string, keepSessionId: string): Promise<void> {
  await getDb().delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

export async function sessionsOf(userId: string) {
  return getDb().select().from(sessions).where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())));
}
