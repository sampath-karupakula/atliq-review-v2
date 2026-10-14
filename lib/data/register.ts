import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appMeta, commitments, contracts, waivers } from "@/lib/db/schema";
import { commitmentStatus, type CommitmentStatus } from "@/lib/checks/dates";
import { appToday } from "@/lib/config";

export type Coverage = { onFile: number; signedInTracker: number };

export async function getCoverage(): Promise<Coverage> {
  const [row] = await getDb().select().from(appMeta).where(eq(appMeta.key, "coverage"));
  return (row?.value as Coverage) ?? { onFile: 0, signedInTracker: 0 };
}

export const coverageLine = (c: Coverage) => `Checked against ${c.onFile} of ${c.signedInTracker} signed contracts`;

export type RegisterRow = typeof commitments.$inferSelect & {
  status: CommitmentStatus;
  sourceContractId: string | null;
  sourceTitle: string | null;
  waivers: (typeof waivers.$inferSelect)[];
};

export async function getRegister(): Promise<RegisterRow[]> {
  const db = getDb();
  const today = appToday();
  const rows = await db
    .select({ c: commitments, sourceTitle: contracts.title })
    .from(commitments)
    .leftJoin(contracts, eq(contracts.id, commitments.contractId))
    .orderBy(asc(commitments.id));
  const allWaivers = await db.select().from(waivers);
  return rows.map(({ c, sourceTitle }) => ({
    ...c,
    status: commitmentStatus(c, today),
    sourceContractId: c.contractId,
    sourceTitle,
    waivers: allWaivers.filter((w) => w.commitmentId === c.id),
  }));
}
