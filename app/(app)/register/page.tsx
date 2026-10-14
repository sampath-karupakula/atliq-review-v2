import type { Metadata } from "next";
import Link from "next/link";
import { PageHead, SeverityChip, Stub, Tag } from "@/components/ui";
import { getCoverage, getRegister, coverageLine, type RegisterRow } from "@/lib/data/register";
import { getBaseline, getPositions } from "@/lib/data/reference";
import { formatDate } from "@/lib/checks/dates";
import { commitmentTypeLabel, PRECEDENT_LABELS, termLabel } from "@/lib/format";
import { currentRole } from "@/lib/viewer";

export const metadata: Metadata = { title: "Register" };
export const dynamic = "force-dynamic";

type Tab = "promises" | "usual" | "prec" | "search";
type PromiseFilter = "live" | "unconf" | "expired" | "all";

const TABS: [Tab, string][] = [
  ["promises", "Promises"],
  ["usual", "Our usual terms"],
  ["prec", "Precedent labels"],
  ["search", "Search past contracts"],
];

function matches(r: RegisterRow, f: PromiseFilter) {
  if (f === "live") return r.status !== "expired";
  if (f === "expired") return r.status === "expired";
  if (f === "unconf") return !r.confirmed;
  return true;
}

function StatusChip({ r }: { r: RegisterRow }) {
  if (r.status === "expired") return <SeverityChip sev="neutral">Expired</SeverityChip>;
  if (r.status === "permanent") return <SeverityChip sev="high">Permanent</SeverityChip>;
  return <SeverityChip sev={r.waivers.length ? "medium" : "high"}>{r.waivers.length ? "Live · waiver on file" : "Live"}</SeverityChip>;
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ tab?: string; f?: string }> }) {
  const [sp, role] = await Promise.all([searchParams, currentRole()]);
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "promises";
  const f: PromiseFilter = (["live", "unconf", "expired", "all"] as const).includes(sp.f as PromiseFilter) ? (sp.f as PromiseFilter) : "live";
  const [register, coverage, baseline, positions] = await Promise.all([getRegister(), getCoverage(), getBaseline(), getPositions()]);
  const counts: Record<PromiseFilter, number> = {
    live: register.filter((r) => matches(r, "live")).length,
    unconf: register.filter((r) => matches(r, "unconf")).length,
    expired: register.filter((r) => matches(r, "expired")).length,
    all: register.length,
  };
  const tabCount: Record<Tab, number | null> = { promises: register.length, usual: baseline.length, prec: positions.length, search: null };
  const order = ["standard", "deliberate_exception", "waved_through", "unclear"];

  return (
    <section className="wrap page">
      <PageHead eyebrow="AtliQ's memory" title="Register" aside={<span className="hint">{coverageLine(coverage)} · {coverage.signedInTracker - coverage.onFile} not on file</span>} />
      <p className="muted" style={{ maxWidth: "68ch", fontSize: 15 }}>
        What AtliQ has already signed that shapes the next contract: promises it must keep, terms it usually agrees, and why past exceptions were made.
      </p>
      <nav className="tabs" aria-label="Register sections">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/register?tab=${k}`} aria-current={tab === k ? "page" : undefined}>
            {label}
            {tabCount[k] !== null ? <span className="muted num" style={{ marginLeft: 6 }}>{tabCount[k]}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "promises" ? (
        <>
          <nav className="chips" aria-label="Filter promises">
            {(
              [
                ["live", "Live"],
                ["unconf", "Unconfirmed"],
                ["expired", "Expired"],
                ["all", "All"],
              ] as [PromiseFilter, string][]
            ).map(([k, label]) => (
              <Link key={k} className="chip" href={`/register?tab=promises&f=${k}`} aria-current={f === k ? "true" : undefined}>
                {label}
                <b className="num">{counts[k]}</b>
              </Link>
            ))}
          </nav>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Promise</th>
                  <th>What it restricts</th>
                  <th>Where</th>
                  <th>Until</th>
                  <th>Status</th>
                  <th>Confirmed</th>
                </tr>
              </thead>
              <tbody>
                {register
                  .filter((r) => matches(r, f))
                  .map((r) => (
                    <tr key={r.id} id={r.id}>
                      <td className="co">
                        {r.contract}
                        <small>
                          {r.id} · {commitmentTypeLabel(r.type)} · Clause{r.clauses.length > 1 ? "s" : ""} {r.clauses.join(", ")}
                          <br />
                          Binds {r.entity === "PVT" ? "AtliQ Technologies Pvt Ltd" : r.entity === "INC" ? "AtliQ Inc" : r.entity}
                          {r.bindsAffiliates ? " and every Affiliate" : ""}
                        </small>
                      </td>
                      <td style={{ maxWidth: 360 }}>
                        <span style={{ display: "block" }}>{r.activity}</span>
                        <small className="hint" style={{ display: "block", marginTop: 4 }}>
                          For: {r.forWhom}
                        </small>
                        {r.waivers.map((w) => (
                          <small key={w.id} className="hint" style={{ display: "block", marginTop: 4 }}>
                            Waiver {w.id} ({formatDate(w.dated)}): {w.scope}. Not covered: {w.excludes}
                          </small>
                        ))}
                      </td>
                      <td>{r.territory.length ? r.territory.join(", ") : <span className="muted">—</span>}</td>
                      <td className="num">{r.ends ? formatDate(r.ends) : r.endRule ?? "No end date"}</td>
                      <td>
                        <StatusChip r={r} />
                      </td>
                      <td>
                        {r.confirmed ? (
                          <>
                            <span style={{ color: "var(--ok)", fontWeight: 600 }}>Confirmed</span>
                            <small className="hint" style={{ display: "block" }}>
                              by {r.confirmedBy ?? "Karandeep"}
                            </small>
                          </>
                        ) : (
                          <Tag kind="overdue">Unconfirmed</Tag>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Live or expired is worked out from today&apos;s date, never by the AI. {role === "ceo" ? "Confirming and correcting promises arrives in P8." : "Only Karandeep can add, correct or confirm promises."}
          </p>
        </>
      ) : null}

      {tab === "usual" ? (
        <>
          <div className="sec-head">
            <h2>Our usual terms</h2>
            <p>The baseline every report compares against</p>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>What AtliQ usually agrees</th>
                  <th>How strong · source</th>
                </tr>
              </thead>
              <tbody>
                {baseline.map((b) => (
                  <tr key={b.term}>
                    <td className="co">{termLabel(b.term)}</td>
                    <td style={{ maxWidth: 460 }}>
                      {b.usual}
                      {b.hardLine ? (
                        <small className="hint" style={{ display: "block", marginTop: 4 }}>
                          Hard line: {b.hardLine}
                        </small>
                      ) : null}
                      {b.exceptions.length ? (
                        <small className="hint" style={{ display: "block", marginTop: 4 }}>
                          Exceptions: {b.exceptions.join("; ")}
                        </small>
                      ) : null}
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      {b.count ?? <span className="muted">—</span>}
                      {b.source ? (
                        <small className="hint" style={{ display: "block" }}>
                          {b.source}
                        </small>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === "prec" ? (
        <>
          <div className="sec-head">
            <h2>Precedent labels</h2>
            <p>A term accepted once is not AtliQ&apos;s standard unless it is labelled so</p>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Counterparty</th>
                  <th>Term</th>
                  <th>What happened</th>
                  <th>Label</th>
                </tr>
              </thead>
              <tbody>
                {[...positions]
                  .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
                  .map((p) => {
                    const l = PRECEDENT_LABELS[p.label] ?? PRECEDENT_LABELS.unclear!;
                    return (
                      <tr key={p.id}>
                        <td className="co">
                          {p.counterparty}
                          <small>{p.date}</small>
                        </td>
                        <td style={{ maxWidth: 260 }}>{p.term}</td>
                        <td style={{ maxWidth: 380 }}>
                          {p.outcome}
                          {p.quote ? (
                            <span className="quote" style={{ display: "block", marginTop: 6, padding: "6px 8px" }}>
                              {p.quote}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <span className={`p ${l.cls}`}>{l.text}</span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="hint">Relabelling a precedent arrives in P8.</p>
        </>
      ) : null}

      {tab === "search" ? <Stub title="Search past contracts" phase="P8 (every clause in the signed contracts on file, expired ones included)" /> : null}
    </section>
  );
}
