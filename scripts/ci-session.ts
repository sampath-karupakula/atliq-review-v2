// CI only: create a session for a seeded user and print its cookie token, so the smoke test can load signed-in pages
// without driving the sign-in form. Refuses to run outside CI.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "@/lib/db/schema";

async function main() {
  if (process.env.CI !== "true") throw new Error("ci-session.ts only runs in CI.");
  const email = process.argv[2] ?? "karandeep@atliq.test";
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const db = drizzle(sql, { schema: s });
  const [u] = await db.select().from(s.users).where(eq(s.users.email, email));
  if (!u) throw new Error(`No user ${email}; set SEED_USER_PASSWORD before pnpm seed.`);
  const token = randomBytes(32).toString("base64url");
  await db.insert(s.sessions).values({ id: createHash("sha256").update(token).digest("hex"), userId: u.id, expiresAt: new Date(Date.now() + 3_600_000) });
  process.stdout.write(token);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
