import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contracts, deals } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { listPeople } from "@/lib/data/people";
import { getCoverage } from "@/lib/data/register";
import { appToday, reviewHorizonDays } from "@/lib/config";
import { Crumbs, PageTitle } from "@/components/ui";
import { displayTitle } from "@/lib/display";
import { UploadForm } from "@/components/UploadForm";
import { SignedUpload } from "@/components/SignedUpload";
import { getMissingSigned } from "@/lib/data/memory";
import Link from "next/link";

export const metadata: Metadata = { title: "Upload a contract" };
export const dynamic = "force-dynamic";

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ previous?: string; mode?: string; tracker?: string }> }) {
  const { previous: previousId, mode, tracker: trackerId } = await searchParams;
  const bulk = mode === "signed" && !previousId;
  const me = await getCurrentUser();
  if (!can(me, "contract.upload")) {
    return (
      <section className="wrap page">
        <PageTitle title="Upload a contract" />
        <div className="stub">
          <p>Your role is read-only, so you can&rsquo;t upload contracts. Ask Karandeep if you need reviewer access.</p>
        </div>
      </section>
    );
  }
  const db = getDb();
  const [allDeals, unsigned, signedMsas, people, coverage] = await Promise.all([
    db.select({ id: deals.id, name: deals.name }).from(deals).orderBy(desc(deals.createdAt)),
    db
      .select({ id: contracts.id, counterparty: contracts.counterparty, docType: contracts.docType, title: contracts.title, version: contracts.version })
      .from(contracts)
      .where(eq(contracts.isSigned, false))
      .orderBy(desc(contracts.createdAt)),
    db.select({ id: contracts.id, counterparty: contracts.counterparty, docType: contracts.docType, title: contracts.title }).from(contracts).where(eq(contracts.docType, "msa")),
    listPeople({ roles: ["admin", "reviewer"] }),
    getCoverage(),
  ]);
  const fill = bulk && trackerId ? ((await getMissingSigned()).find((t) => t.trackerId === trackerId) ?? null) : null;
  const [prev] = previousId && /^[0-9a-f-]{36}$/i.test(previousId) ? await db.select().from(contracts).where(eq(contracts.id, previousId)) : [];
  const label = (c: { counterparty: string; docType: string; title: string }) => {
    const t = displayTitle(c);
    return `${t.primary} · ${t.secondary}`;
  };
  const names = people.map((p) => p.name);
  return (
    <section className="wrap page">
      <Crumbs items={[{ href: "/contracts", label: "Contracts" }, { label: prev ? "New version" : "Upload" }]} />
      <PageTitle
        title={prev ? "Upload a new version" : bulk ? "Add signed contracts to the register" : "Add a contract to review"}
        subtitle={bulk ? "Signed contracts are what every review is checked against. The more are on file, the fewer clashes go unseen." : "The whole document is read, clause by clause. Nothing is signed, sent or edited."}
        actions={
          prev ? null : (
            <nav className="vswitch big" aria-label="What are you uploading?">
              <Link href="/contracts/new" aria-current={!bulk ? "true" : undefined}>
                A contract to review
              </Link>
              <Link href="/contracts/new?mode=signed" aria-current={bulk ? "true" : undefined}>
                Signed contracts, in bulk
              </Link>
            </nav>
          )
        }
      />
      <p className="hint" style={{ background: "var(--accent-soft)", borderRadius: 6, padding: "8px 12px", fontSize: 13.5, color: "var(--ink-2)" }}>
        <b>Private by design.</b> Nothing is sent to the AI at upload. When a review runs, names, emails and addresses are replaced with labels first. Checked against {coverage.onFile} of {coverage.signedInTracker} signed contracts on file.
      </p>
      {bulk ? <SignedUpload coverage={coverage} tracker={fill ? { trackerId: fill.trackerId, label: `${fill.counterparty} · ${fill.docType}${fill.signedDate ? ` · signed ${fill.signedDate}` : ""}` } : null} /> : null}
      {bulk ? null : <UploadForm
        deals={allDeals.map((d) => ({ id: d.id, label: d.name }))}
        contracts={unsigned.map((c) => ({ id: c.id, label: `${label(c)} (v${c.version})` }))}
        msas={signedMsas.map((c) => ({ id: c.id, label: label(c) }))}
        previous={prev ? { id: prev.id, label: `${label(prev)} (v${prev.version})`, counterparty: prev.counterparty, dealId: prev.dealId } : null}
        defaultOwner={me.name}
        owners={names}
        assignees={names}
        me={me.name}
        canAssignOthers={can(me, "review.assign")}
        today={appToday()}
        horizonDays={reviewHorizonDays()}
      />}
    </section>
  );
}
