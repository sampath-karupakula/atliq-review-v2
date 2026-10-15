"use server";
// Sign in, sign out, change password. One generic error for a wrong email or password (no account enumeration);
// a password check runs even for unknown emails so timing doesn't tell them apart. Five wrong passwords lock the
// account for 15 minutes; each connection is also rate-limited.
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { DUMMY_HASH, hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyOtherSessions, destroySession, getSessionUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/ratelimit";
import { logEvent } from "@/lib/data/audit";

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

type FormState = { error?: string; ok?: string } | null;

function safeNext(next: unknown): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/dashboard";
}

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
  const limit = rateLimit(`login:${ip}`, 20, 15 * 60_000);
  if (!limit.ok) return { error: `Too many sign-in attempts from this connection. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.` };
  if (!email || !password) return { error: "Enter your email and password." };

  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ok = await verifyPassword(password, u?.passwordHash ?? DUMMY_HASH);
  const generic = { error: "That email and password don't match an account." };
  if (!u || !u.active) return generic;
  if (u.lockedUntil && u.lockedUntil > new Date()) {
    const mins = Math.ceil((u.lockedUntil.getTime() - Date.now()) / 60_000);
    return { error: `Too many wrong passwords. This account is locked for ${mins} more minute${mins === 1 ? "" : "s"}, or an admin can reset the password.` };
  }
  if (!ok) {
    const failed = u.failedLogins + 1;
    await db
      .update(users)
      .set({ failedLogins: failed >= LOCK_AFTER ? 0 : failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
      .where(eq(users.id, u.id));
    if (failed >= LOCK_AFTER) await logEvent({ actor: u.name, action: "auth.locked", text: `Account locked for ${LOCK_MINUTES} minutes after ${LOCK_AFTER} wrong passwords` });
    return generic;
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, u.id));
  await createSession(u.id);
  await logEvent({ actor: u.name, action: "auth.sign_in", text: "Signed in" });
  redirect(u.mustChangePassword ? "/account?first=1" : safeNext(form.get("next")));
}

export async function signOut(): Promise<void> {
  const u = await getSessionUser();
  await destroySession();
  if (u) await logEvent({ actor: u.name, action: "auth.sign_out", text: "Signed out" });
  redirect("/login");
}

export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.demo) return { error: "You're viewing the demo without signing in. Sign in with your own account to change a password." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, me.id));
  if (!u || !(await verifyPassword(current, u.passwordHash))) return { error: "Your current password isn't right." };
  if (next !== confirm) return { error: "The new passwords don't match." };
  if (next === current) return { error: "Choose a password different from the current one." };
  const problem = passwordProblem(next, { email: u.email, name: u.name });
  if (problem) return { error: problem };
  await db.update(users).set({ passwordHash: await hashPassword(next), mustChangePassword: false }).where(eq(users.id, u.id));
  await destroyOtherSessions(u.id, me.sessionId);
  await logEvent({ actor: u.name, action: "auth.password_change", text: "Changed their password (other devices signed out)" });
  if (me.mustChangePassword) redirect("/dashboard");
  return { ok: "Password changed. You've been signed out on other devices." };
}

export async function signOutOtherDevices(): Promise<FormState> {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.demo) return { error: "You're viewing the demo without signing in, so there are no other sessions." };
  await destroyOtherSessions(me.id, me.sessionId);
  await logEvent({ actor: me.name, action: "auth.sign_out", text: "Signed out on all other devices" });
  return { ok: "Signed out on all other devices." };
}
