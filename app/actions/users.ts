"use server";
// User management (admins only): create accounts with a one-time temporary password, change roles, deactivate and
// reactivate, reset passwords. Guards: an admin can't remove the last active admin (including themselves), and a
// deactivated or reset account is signed out everywhere at once. Every change is audited.
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { authorize, destroyAllSessions, PermissionError } from "@/lib/auth/session";
import { hashPassword, temporaryPassword } from "@/lib/auth/password";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/auth/permissions";
import { logEvent } from "@/lib/data/audit";

type Result = { ok: true; tempPassword?: string } | { ok: false; error: string };

async function admin(): Promise<string | { error: string }> {
  try {
    return (await authorize("users.manage")).name;
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : "Not allowed." };
  }
}

async function otherActiveAdmins(exceptId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.active, true), ne(users.id, exceptId)));
  return rows.length;
}

const NewUser = z.object({
  name: z.string().trim().min(2, "Enter the person's name.").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(ROLES),
});

export async function createUser(input: z.input<typeof NewUser>): Promise<Result> {
  const actor = await admin();
  if (typeof actor !== "string") return { ok: false, error: actor.error };
  const parsed = NewUser.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  const d = parsed.data;
  const db = getDb();
  const [clash] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.email, d.email));
  if (clash) return { ok: false, error: "An account with that email already exists." };
  const [nameClash] = await db.select({ id: users.id }).from(users).where(eq(users.name, d.name));
  if (nameClash) return { ok: false, error: "Someone already has that name. Add a surname or initial so people can tell them apart." };
  const temp = temporaryPassword();
  await db.insert(users).values({ name: d.name, email: d.email, role: d.role, passwordHash: await hashPassword(temp), mustChangePassword: true });
  await logEvent({ actor, action: "user.create", text: `Created an account for ${d.name} (${d.email}) as ${ROLE_LABEL[d.role]}` });
  revalidatePath("/admin/users");
  return { ok: true, tempPassword: temp };
}

export async function setRole(userId: string, role: Role): Promise<Result> {
  const actor = await admin();
  if (typeof actor !== "string") return { ok: false, error: actor.error };
  if (!ROLES.includes(role)) return { ok: false, error: "Unknown role." };
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return { ok: false, error: "User not found." };
  if (u.role === "admin" && role !== "admin" && (await otherActiveAdmins(u.id)) === 0) return { ok: false, error: "There must always be at least one active admin." };
  await db.update(users).set({ role }).where(eq(users.id, userId));
  await logEvent({ actor, action: "user.role", text: `Changed ${u.name}'s role from ${ROLE_LABEL[u.role as Role]} to ${ROLE_LABEL[role]}` });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setActive(userId: string, active: boolean): Promise<Result> {
  const actor = await admin();
  if (typeof actor !== "string") return { ok: false, error: actor.error };
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return { ok: false, error: "User not found." };
  if (!active && u.role === "admin" && (await otherActiveAdmins(u.id)) === 0) return { ok: false, error: "You can't deactivate the last active admin." };
  await db.update(users).set({ active, failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId));
  if (!active) await destroyAllSessions(userId);
  await logEvent({ actor, action: "user.active", text: `${active ? "Reactivated" : "Deactivated"} ${u.name}'s account${active ? "" : " (signed out everywhere)"}` });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function resetPassword(userId: string): Promise<Result> {
  const actor = await admin();
  if (typeof actor !== "string") return { ok: false, error: actor.error };
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return { ok: false, error: "User not found." };
  const temp = temporaryPassword();
  await db.update(users).set({ passwordHash: await hashPassword(temp), mustChangePassword: true, failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId));
  await destroyAllSessions(userId);
  await logEvent({ actor, action: "user.reset", text: `Reset ${u.name}'s password (signed out everywhere; must choose a new one)` });
  revalidatePath("/admin/users");
  return { ok: true, tempPassword: temp };
}
