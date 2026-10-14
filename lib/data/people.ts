import "server-only";
// The people who can act, for pickers (owner, reviewer) and notification recipients. Accounts arrive in P11; until
// then, and whenever the users table is empty, the demo team stands in: Karandeep (admin), the four reviewers who
// own deals in the dataset, and Counsel (read-only).
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { Role } from "@/lib/auth/permissions";

export type PersonRow = { name: string; role: Role };

export const DEMO_PEOPLE: PersonRow[] = [
  { name: "Karandeep", role: "admin" },
  { name: "Bhavin", role: "reviewer" },
  { name: "Dhaval", role: "reviewer" },
  { name: "Jay", role: "reviewer" },
  { name: "Pranav", role: "reviewer" },
  { name: "Counsel", role: "viewer" },
];

async function allPeople(includeInactive = false): Promise<PersonRow[]> {
  const rows = await getDb().select({ name: users.name, role: users.role, active: users.active }).from(users).orderBy(asc(users.name));
  if (!rows.length) return DEMO_PEOPLE;
  return rows.filter((r) => includeInactive || r.active).map((r) => ({ name: r.name, role: r.role as Role }));
}

export async function listPeople(opts: { roles?: Role[]; includeInactive?: boolean } = {}): Promise<PersonRow[]> {
  return (await allPeople(opts.includeInactive)).filter((r) => !opts.roles || opts.roles.includes(r.role));
}

/** Who gets "review finished" and comment notifications besides the owner: every active admin. */
export async function adminNames(): Promise<string[]> {
  return (await allPeople()).filter((p) => p.role === "admin").map((p) => p.name);
}

export async function isActiveUser(name: string, roles?: Role[]): Promise<boolean> {
  const [u] = await getDb().select({ role: users.role, active: users.active }).from(users).where(eq(users.name, name));
  if (u) return u.active && (!roles || roles.includes(u.role as Role));
  // No account yet: the demo team counts.
  const demo = DEMO_PEOPLE.find((p) => p.name === name);
  return !!demo && (!roles || roles.includes(demo.role));
}
