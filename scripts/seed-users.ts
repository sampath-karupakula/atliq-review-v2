// Demo accounts for AtliQ's people (pnpm seed creates them; pnpm seed:users runs this alone).
// They all start with SEED_USER_PASSWORD (from .env.local or the environment). Existing accounts are never changed,
// so re-seeding doesn't reset anyone's password. Set SEED_FORCE_PASSWORD_CHANGE=1 to make people choose their own
// password on first sign-in (recommended on a shared deployment). `pnpm seed:users --reset-passwords` sets the six
// demo accounts back to SEED_USER_PASSWORD (and unlocks them, signing them out), e.g. after changing it in .env.local.
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, sql as dsql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "@/lib/db/schema";
import { hashPassword, passwordProblem } from "@/lib/auth/password";

export const DEMO_USERS: { name: string; email: string; role: "admin" | "reviewer" | "viewer" }[] = [
  { name: "Karandeep", email: "karandeep@atliq.test", role: "admin" },
  { name: "Dhaval", email: "dhaval@atliq.test", role: "reviewer" },
  { name: "Jay", email: "jay@atliq.test", role: "reviewer" },
  { name: "Bhavin", email: "bhavin@atliq.test", role: "reviewer" },
  { name: "Pranav", email: "pranav@atliq.test", role: "reviewer" },
  { name: "Counsel", email: "counsel@atliq.test", role: "viewer" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedUsers(db: any, opts: { resetPasswords?: boolean } = {}): Promise<void> {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password) {
    console.log("Users: skipped (set SEED_USER_PASSWORD to create the demo accounts).");
    return;
  }
  const problem = passwordProblem(password);
  if (problem) throw new Error(`SEED_USER_PASSWORD is too weak: ${problem}`);
  const force = process.env.SEED_FORCE_PASSWORD_CHANGE === "1";
  let created = 0;
  for (const u of DEMO_USERS) {
    const rows = await db
      .insert(s.users)
      .values({ ...u, passwordHash: await hashPassword(password), mustChangePassword: force })
      .onConflictDoNothing()
      .returning({ id: s.users.id });
    created += rows.length;
  }
  if (opts.resetPasswords) {
    for (const u of DEMO_USERS) {
      const [row] = await db
        .update(s.users)
        .set({ passwordHash: await hashPassword(password), mustChangePassword: force, failedLogins: 0, lockedUntil: null })
        .where(eq(s.users.email, u.email))
        .returning({ id: s.users.id });
      if (row) await db.delete(s.sessions).where(eq(s.sessions.userId, row.id));
    }
    console.log(`Users: passwords reset for ${DEMO_USERS.map((u) => u.email).join(", ")} (signed out, unlocked).`);
  }
  const [{ n }] = (await db.execute(dsql`select count(*)::int as n from users`)) as unknown as { n: number }[];
  console.log(`Users: ${created} created, ${n} in total (${DEMO_USERS.map((u) => `${u.name}=${u.role}`).join(", ")}).`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed-users.ts")) {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  seedUsers(drizzle(sql, { schema: s }), { resetPasswords: process.argv.includes("--reset-passwords") })
    .then(() => sql.end())
    .catch(async (err) => {
      console.error(err);
      await sql.end();
      process.exit(1);
    });
}
