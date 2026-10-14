import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { contractLinks, contracts, dealDocuments, deals, negotiationConditions } from "@/lib/db/schema";
import type { DocType } from "@/lib/ingest/doctype";
import type { ClauseMap } from "@/lib/ingest/clauses";
import { notify } from "./notify";
import { adminNames } from "./people";
import { assignCompanies } from "./companies";

/** Deal details collected on upload (ROADMAP §9.3). Required unless linking to an existing deal. */
export const UploadDetails = z
  .object({
    counterparty: z.string({ error: "Enter the counterparty's name." }).trim().min(2, "Enter the counterparty's name."),
    owner: z.string({ error: "Choose the deal owner." }).trim().min(2, "Choose the deal owner."),
    valueUsd: z.coerce.number({ error: "Deal value must be a number." }).nonnegative().optional().nullable(),
    currency: z.string().trim().default("USD"),
    // Required for a new deal; taken from the deal when linking to an existing one (checked below).
    domain: z.string().trim().optional().default(""),
    clientCountry: z.string().trim().optional().default(""),
    deliveredFrom: z.string().trim().min(2).default("Pune, India"),
    dataTouchers: z.array(z.string().trim().min(1)).default([]),
    clientDeadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Client deadline must be a date")
      .optional()
      .nullable(),
    personalData: z.boolean().optional().nullable(),
    phi: z.boolean().optional().nullable(),
    direction: z.enum(["atliq_supplier", "atliq_buyer"]).default("atliq_supplier"),
    dealId: z.string().uuid().optional().nullable(),
    docRole: z.string().trim().optional().nullable(),
    previousVersionId: z.string().uuid().optional().nullable(),
    parentContractId: z.string().uuid().optional().nullable(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.dealId || d.previousVersionId) return;
    if (d.domain.length < 2) ctx.addIssue({ code: "custom", path: ["domain"], message: "Enter the business domain (e.g. hospitality analytics)." });
    if (d.clientCountry.length < 2) ctx.addIssue({ code: "custom", path: ["clientCountry"], message: "Enter the client's country." });
  });
export type UploadDetails = z.infer<typeof UploadDetails>;

export async function findContractByHash(hash: string): Promise<string | null> {
  const [row] = await getDb().select({ id: contracts.id }).from(contracts).where(eq(contracts.textHash, hash)).limit(1);
  return row?.id ?? null;
}

const ROLE_FOR_TYPE: Partial<Record<DocType, string>> = {
  baa: "baa",
  dpa: "dpa",
  nda: "nda",
  subcontract: "subcontract",
  freelancer: "freelancer",
  sow: "sow",
};

/** Store an uploaded contract, creating its deal (or attaching it to an existing one). */
export async function storeUpload(args: {
  details: UploadDetails;
  title: string;
  text: string;
  hash: string;
  docType: DocType;
  clauses: ClauseMap;
  sourceFile: string;
}): Promise<{ contractId: string; dealId: string; version: number }> {
  const { details: d } = args;
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    let dealId = d.dealId ?? null;
    let version = 1;
    let previousVersionId: string | null = null;

    if (d.previousVersionId) {
      const [prev] = await tx.select().from(contracts).where(eq(contracts.id, d.previousVersionId));
      if (!prev) throw new Error("The previous version was not found.");
      version = prev.version + 1;
      previousVersionId = prev.id;
      dealId = dealId ?? prev.dealId;
    }

    if (!dealId) {
      const [deal] = await tx
        .insert(deals)
        .values({
          name: `${d.counterparty} — ${args.title}`.slice(0, 160),
          owner: d.owner,
          valueUsd: d.valueUsd ?? null,
          currency: d.currency,
          domain: d.domain,
          clientCountry: d.clientCountry,
          deliveredFrom: d.deliveredFrom,
          dataTouchers: d.dataTouchers,
          clientDeadline: d.clientDeadline ?? null,
          flow: d.parentContractId ? "upsell" : "new",
          personalData: d.personalData ?? null,
          phi: d.phi ?? null,
        })
        .returning({ id: deals.id });
      dealId = deal.id;
    }

    const [contract] = await tx
      .insert(contracts)
      .values({
        dealId,
        title: args.title,
        counterparty: d.counterparty,
        owner: d.owner,
        docType: args.docType,
        direction: d.direction,
        status: "received",
        sourceFile: args.sourceFile,
        text: args.text,
        textHash: args.hash,
        clauseCount: args.clauses.clauseCount,
        scheduleItemCount: args.clauses.scheduleItemCount,
        version,
        previousVersionId,
      })
      .returning({ id: contracts.id });

    const role = d.docRole ?? (previousVersionId ? null : ROLE_FOR_TYPE[args.docType] ?? "client_contract");
    if (previousVersionId) {
      // The new version takes the old version's place in the deal bundle.
      await tx
        .update(dealDocuments)
        .set({ contractId: contract.id })
        .where(and(eq(dealDocuments.dealId, dealId), eq(dealDocuments.contractId, previousVersionId)));
      await tx.insert(contractLinks).values({ fromId: contract.id, toId: previousVersionId, kind: "version_of" });
      // Karandeep's open conditions carry over: the re-review checks each against the new version.
      const carried = await tx.select().from(negotiationConditions).where(and(eq(negotiationConditions.contractId, previousVersionId), eq(negotiationConditions.open, true)));
      if (carried.length) {
        await tx.insert(negotiationConditions).values(carried.map((c) => ({ contractId: contract.id, round: version, text: c.text, createdBy: c.createdBy, open: true, addressed: null })));
      }
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(dealDocuments)
        .where(and(eq(dealDocuments.dealId, dealId), eq(dealDocuments.contractId, contract.id)));
      if (n === 0) await tx.insert(dealDocuments).values({ dealId, contractId: contract.id, role: role ?? "client_contract" });
    } else {
      await tx.insert(dealDocuments).values({ dealId, contractId: contract.id, role: role ?? "client_contract" });
    }
    if (d.parentContractId) {
      await tx.insert(contractLinks).values({ fromId: contract.id, toId: d.parentContractId, kind: "sow_under" });
      await tx.insert(dealDocuments).values({ dealId, contractId: d.parentContractId, role: "parent_msa" }).onConflictDoNothing();
    }
    return { contractId: contract.id, dealId, version };
  });
  // File the new document under its company (a new company is created if it's the first document from them).
  await assignCompanies();
  if (result.version > 1) {
    // A returned draft: the owner and Karandeep are told a new version is in (it is reviewed in full again).
    for (const r of new Set([d.owner, ...(await adminNames())])) {
      await notify({ recipient: r, kind: "new_version", contractId: result.contractId, text: `New version ${result.version} uploaded: ${args.title} (${d.counterparty}).`, dedupeKey: `new-version:${result.contractId}:${r}` });
    }
  }
  return result;
}
