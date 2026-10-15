import type { Metadata } from "next";
import Link from "next/link";
import { PageHead, SeverityChip } from "@/components/ui";
import { listDeals } from "@/lib/data/deals";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/checks/dates";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Deals" };
export const dynamic = "force-dynamic";

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const [sp, me, all] = await Promise.all([searchParams, getCurrentUser(), listDeals()]);
  const mine = sp.mine === "1";
  const mineN = all.filter((d) => d.owner === me?.name).length;
  const list = mine ? all.filter((d) => d.owner === me?.name) : all;
  return (
    <section className="wrap page">
      <PageHead eyebrow="Deal bundles" title="Deals" />
      <nav className="chips" aria-label="Filter deals">
        <Link className="chip" href="/deals" aria-current={!mine ? "true" : undefined}>
          All deals<b className="num">{all.length}</b>
        </Link>
        <Link className="chip" href="/deals?mine=1" aria-current={mine ? "true" : undefined}>
          Owned by me<b className="num">{mineN}</b>
        </Link>
      </nav>
      <p className="muted" style={{ fontSize: 15, maxWidth: "68ch" }}>
        Each deal&apos;s documents are checked against AtliQ&apos;s deal-type rules and the promises it has already made.
      </p>
      {list.length ? (
        <div className="cards2">
          {list.map((d) => {
            const status = d.clashes.length
              ? `Needs a waiver: ${d.clashes.join(", ")}${d.missing.length > 1 ? ` · ${d.missing.length - 1} more missing` : ""}`
              : d.missing.length
                ? `Incomplete: ${d.missing.join(", ")} missing`
                : d.toCheck
                  ? `${d.toCheck} contractor agreement${d.toCheck === 1 ? "" : "s"} to check for flow-down terms`
                  : "Complete";
            return (
              <article key={d.id} className="deal">
                <div className="top">
                  <h3 style={{ margin: 0 }}>{d.name}</h3>
                  <span className="hint">Owner: {d.owner}</span>
                </div>
                <p className="hint" style={{ margin: 0 }}>
                  {d.domain} · {d.clientCountry}
                  {d.valueUsd !== null ? ` · ${money(d.valueUsd, d.currency)}` : ""}
                  {d.clientDeadline ? ` · client deadline ${formatDate(d.clientDeadline)}` : ""}
                </p>
                <span className="dismiss-row">
                  {d.complete && !d.clashes.length ? <SeverityChip sev="okc">Complete</SeverityChip> : <SeverityChip sev={d.clashes.length ? "serious" : "negotiable"}>{d.clashes.length ? "Clashes with a promise" : "Incomplete"}</SeverityChip>}
                  {d.gate.allowed === false ? <span className="gate no">Data transfer not allowed</span> : null}
                </span>
                <p style={{ fontSize: 14, margin: 0 }}>{status}</p>
                <div>
                  <Link className="btn small" href={`/deals/${d.id}`}>
                    Open deal · {d.docCount} document{d.docCount === 1 ? "" : "s"}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="stub">
          <p>{mine ? "You don't own any deals." : "No deals yet. Upload a contract and link it to a deal."}</p>
        </div>
      )}
    </section>
  );
}
