import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/ui";
import { QueueTable } from "@/components/contracts/QueueTable";
import { CompanyTable } from "@/components/contracts/CompanyTable";
import { SignedTable } from "@/components/contracts/SignedTable";
import { CoveragePanel } from "@/components/contracts/CoveragePanel";
import { getQueueRows } from "@/lib/data/queue";
import { getSignedContracts } from "@/lib/data/portfolio";
import { getCompanies, sortCompanies } from "@/lib/data/companyView";
import { getCoverage } from "@/lib/data/register";
import { filterCounts, filterQueue, isQueueFilter, QUEUE_FILTERS, type QueueFilter } from "@/lib/queue";
import { appToday } from "@/lib/config";
import { currentRole } from "@/lib/viewer";
import { ROLES } from "@/lib/roles";

export const metadata: Metadata = { title: "Contracts" };
export const dynamic = "force-dynamic";

type View = "company" | "open" | "mine" | "signed";
const VIEWS: View[] = ["company", "open", "mine", "signed"];

function href(p: { view: View; filter?: QueueFilter; q?: string }) {
  const s = new URLSearchParams();
  s.set("view", p.view);
  if (p.filter && p.filter !== "all") s.set("filter", p.filter);
  if (p.q) s.set("q", p.q);
  return `/contracts?${s.toString()}`;
}

export default async function ContractsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const role = await currentRole();
  // A filter in the link (from a dashboard number) means the flat list, filtered.
  const filter: QueueFilter = isQueueFilter(sp.filter) ? sp.filter : "all";
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : sp.filter ? "open" : "company";
  const q = sp.q?.trim() ?? "";
  const today = appToday();
  const me = ROLES[role].name;

  const [queue, signed, companies, coverage] = await Promise.all([getQueueRows(), getSignedContracts(), getCompanies(), getCoverage()]);
  const counts = filterCounts(queue, today);
  const mine = queue.filter((r) => r.reviewer === me);
  const viewCount: Record<View, number> = { company: companies.length, open: queue.length, mine: mine.length, signed: signed.length };
  const viewLabel: Record<View, string> = { company: "By company", open: "All open", mine: "Assigned to me", signed: "Signed portfolio" };
  const shownViews = VIEWS.filter((v) => !(v === "mine" && role === "counsel"));

  const sq = q.toLowerCase();
  const companyRows = sortCompanies(
    companies.filter((c) => !sq || [c.name, c.country, ...c.open.map((o) => o.title), ...c.active.map((a) => a.title)].join(" ").toLowerCase().includes(sq)),
  );

  return (
    <section className="wrap page">
      <PageHead
        eyebrow={`${queue.length} in review · ${signed.filter((s) => s.inForce).length} signed in force · ${signed.filter((s) => !s.inForce).length} ended`}
        title="Contracts"
        aside={role !== "counsel" ? <Link className="btn" href="/contracts/new">Upload a contract</Link> : null}
      />
      <div className={role === "ceo" && view === "company" ? "today-grid" : undefined}>
        <section className="queue">
          <div className="panel">
            <nav className="vswitch big" aria-label="View" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
              {shownViews.map((v) => (
                <Link key={v} href={href({ view: v, q })} aria-current={view === v ? "true" : undefined}>
                  {viewLabel[v]} <span className="num" style={{ opacity: 0.7 }}>{viewCount[v]}</span>
                </Link>
              ))}
            </nav>
            {view !== "signed" ? (
              <form action="/contracts" method="get" className="fl" role="search">
                <input type="hidden" name="view" value={view} />
                {view === "open" && filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
                <label htmlFor="contracts-q">Search</label>
                <input
                  type="search"
                  id="contracts-q"
                  name="q"
                  defaultValue={q}
                  placeholder={view === "company" ? "Company, country or document" : "Company, document, owner or reviewer"}
                />
              </form>
            ) : null}
            {view === "open" ? (
              <nav className="chips" aria-label="Filter contracts">
                {QUEUE_FILTERS.map(([k, label]) => (
                  <Link key={k} className="chip" href={href({ view: "open", filter: k, q })} aria-current={filter === k ? "true" : undefined}>
                    {label}
                    <b className="num">{counts[k]}</b>
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>

          {view === "company" ? (
            <>
              <p className="hint" aria-live="polite">
                {companyRows.length} of {companies.length} companies · open work first, soonest deadline first
              </p>
              <CompanyTable rows={companyRows} today={today} />
            </>
          ) : null}
          {view === "open" ? (
            <>
              <div className="sec-head">
                <h2>{filter === "all" ? "All open contracts" : QUEUE_FILTERS.find(([k]) => k === filter)?.[1]}</h2>
                <p>Soonest client deadline first, then risk</p>
              </div>
              <QueueTable rows={filterQueue(queue, filter, q, today)} today={today} />
            </>
          ) : null}
          {view === "mine" ? (
            <>
              <div className="sec-head">
                <h2>Assigned to {me}</h2>
                <p>Soonest client deadline first</p>
              </div>
              <QueueTable
                rows={filterQueue(mine, "all", q, today)}
                today={today}
                empty={
                  <div className="stub">
                    <p>Nothing is assigned to {me} right now. Assigning reviews arrives in P10.</p>
                  </div>
                }
              />
            </>
          ) : null}
          {view === "signed" ? (
            <>
              <div className="sec-head">
                <h2>Signed portfolio</h2>
                <p>
                  {signed.length} signed documents on file · exposures inside them are found by the portfolio scan (P8)
                </p>
              </div>
              <SignedTable rows={signed} />
            </>
          ) : null}
        </section>
        {role === "ceo" && view === "company" ? (
          <aside className="side">
            <CoveragePanel coverage={coverage} />
          </aside>
        ) : null}
      </div>
    </section>
  );
}
