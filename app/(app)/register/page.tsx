import type { Metadata } from "next";
import Link from "next/link";
import { PageHead, SeverityChip, Tag } from "@/components/ui";
import { getCoverage, getRegister, coverageLine, type RegisterRow } from "@/lib/data/register";
import { getBaseline, getPositions, getSignedRefs } from "@/lib/data/reference";
import { sourceContract } from "@/lib/memory/precedent";
import { HashMark } from "@/components/register/HashMark";
import { getSearchDocs } from "@/lib/data/memory";
import { formatDate } from "@/lib/checks/dates";
import { commitmentTypeLabel, PRECEDENT_LABELS, termLabel } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { AddPromiseButton, LabelSelect, MarkTemplateDone, PromiseControls, type PromiseValues } from "@/components/register/RegisterControls";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { templateFixes } from "@/lib/db/schema";
import { termStrength } from "@/lib/memory/strength";
import { CLAUSE_TYPES, normalise, searchClauses, type ClauseType } from "@/lib/memory/search";

export const metadata: Metadata = { title: "Register" };
export const dynamic = "force-dynamic";

type Tab = "promises" | "usual" | "prec" | "templates" | "search";
type PromiseFilter = "live" | "unconf" | "expired" | "all";

const TABS: [Tab, string][] = [
  ["promises", "Promises"],
  ["usual", "Our usual terms"],
  ["prec", "Precedent labels"],
  ["templates", "Template fixes"],
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

/** Marks each query word, matching the way search ignores case and punctuation. */
function Highlight({ text, q }: { text: string; q: string }) {
  const words = normalise(q)
    .trim()
    .split(" ")
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return <>{parts.map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</>;
}

const promiseValues = (r: RegisterRow): PromiseValues & { confirmed: boolean; label: string } => ({
  id: r.id,
  type: r.type,
  contract: r.contract,
  signed: r.signed,
  entity: r.entity,
  clauses: r.clauses.join(", "),
  bindsAffiliates: r.bindsAffiliates,
  activity: r.activity,
  forWhom: r.forWhom,
  territory: r.territory.join(", "),
  domain: r.domain,
  starts: r.starts,
  ends: r.ends ?? "",
  endRule: r.endRule ?? "",
  quote: r.quote,
  confirmed: r.confirmed,
  label: `${r.id} · ${r.contract}`,
});

const clauseTypeLabel = (t: ClauseType) => CLAUSE_TYPES.find(([k]) => k === t)?.[1] ?? t;

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ tab?: string; f?: string; q?: string; type?: string; status?: string }> }) {
  const [sp, me] = await Promise.all([searchParams, getCurrentUser()]);
  const canEdit = can(me, "register.edit");
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "promises";
  const f: PromiseFilter = (["live", "unconf", "expired", "all"] as const).includes(sp.f as PromiseFilter) ? (sp.f as PromiseFilter) : "live";
  const [register, coverage, baseline, rawPositions, signedRefs, fixes] = await Promise.all([getRegister(), getCoverage(), getBaseline(), getPositions(), getSignedRefs(), getDb().select().from(templateFixes).orderBy(desc(templateFixes.approvedAt))]);
  const positions = rawPositions.map((p) => ({ ...p, contractId: sourceContract(p, signedRefs)?.id ?? null }));
  const counts: Record<PromiseFilter, number> = {
    live: register.filter((r) => matches(r, "live")).length,
    unconf: register.filter((r) => matches(r, "unconf")).length,
    expired: register.filter((r) => matches(r, "expired")).length,
    all: register.length,
  };
  const tabCount: Record<Tab, number | null> = { promises: register.length, usual: baseline.length, prec: positions.length, templates: fixes.filter((x) => x.status === "approved").length, search: null };
  const order = ["standard", "deliberate_exception", "waved_through", "unclear"];

  const q = (sp.q ?? "").slice(0, 120);
  const qType = (CLAUSE_TYPES.some(([k]) => k === sp.type) ? sp.type : "all") as ClauseType | "all";
  const qStatus = sp.status === "in_force" || sp.status === "expired" ? sp.status : "all";
  const hits = tab === "search" && q.trim() ? searchClauses(await getSearchDocs(), q, { type: qType, status: qStatus }) : [];
  const hitContracts = new Set(hits.map((h) => h.contractId)).size;

  return (
    <section className="wrap page">
      <HashMark />
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
          <div className="dismiss-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
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
            {canEdit ? <AddPromiseButton /> : null}
          </div>
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
                        {r.sourceContractId ? (
                          <Link className="src" href={`/contracts/${r.sourceContractId}?tab=text`} style={{ display: "block" }}>
                            Signed contract
                          </Link>
                        ) : null}
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
                      <td className="num">{r.ends ? formatDate(r.ends) : (r.endRule ?? "No end date")}</td>
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
                        {canEdit ? <PromiseControls row={promiseValues(r)} /> : null}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Live or expired is worked out from today&apos;s date, never by the AI.{" "}
            {canEdit ? "A correction is logged with what it was before; the next review checks against the new wording." : "Only Karandeep can add, correct or confirm promises."}
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
                {baseline.map((b) => {
                  const st = termStrength(b.count, b.source);
                  return (
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
                      <td style={{ maxWidth: 280 }}>
                        <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }} title={st.pct !== null ? `${st.pct}% of signed contracts` : undefined}>
                          <span className="strength" role="img" aria-label={`Strength ${st.level} of 3`}>
                            {[1, 2, 3].map((n) => (
                              <i key={n} className={st.level >= n ? "on" : undefined} />
                            ))}
                          </span>
                          <b style={{ fontWeight: 600 }}>{st.label}</b>
                        </span>
                        {b.count && !/\d+\s+of\s+\d+/.test(b.count) ? (
                          <small className="hint" style={{ display: "block", marginTop: 4 }}>
                            {b.count}
                          </small>
                        ) : null}
                        {b.source ? (
                          <small className="hint" style={{ display: "block", marginTop: 4 }}>
                            {b.source}
                          </small>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
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
                  .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label) || a.id - b.id)
                  .map((p) => {
                    const l = PRECEDENT_LABELS[p.label] ?? PRECEDENT_LABELS.unclear!;
                    return (
                      <tr key={p.id} id={`pos-${p.id}`}>
                        <td className="co">
                          {p.counterparty}
                          <small>{p.date}</small>
                          {p.contractId ? (
                            <Link className="src" href={`/contracts/${p.contractId}?tab=text`}>
                              Signed contract
                            </Link>
                          ) : (
                            <small>Signed contract not on file</small>
                          )}
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
                          {canEdit ? (
                            <span className="label-select">
                              <LabelSelect id={p.id} label={p.label} who={`${p.counterparty} (${p.date})`} />
                            </span>
                          ) : (
                            <span className={`p ${l.cls}`}>{l.text}</span>
                          )}
                          <small className="hint" style={{ display: "block", marginTop: 4 }}>
                            {p.confirmed ? "Confirmed" : "Not confirmed yet"}
                          </small>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="hint">Only a Standard position counts as precedent on a report. Waved through and deliberate exceptions show as warnings, never as something to copy.</p>
        </>
      ) : null}

      {tab === "templates" ? (
        <>
          <div className="sec-head">
            <h2>Template fixes</h2>
            <p>Clauses in AtliQ&apos;s own buyer-side paper that AtliQ wouldn&apos;t accept from a client</p>
          </div>
          {fixes.length ? (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Clause</th>
                    <th>Spotted in</th>
                    <th>Fair version</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fixes.map((x) => (
                    <tr key={x.id}>
                      <td className="co" style={{ maxWidth: 280 }}>
                        {x.title}
                        {x.quote ? <small>&ldquo;{x.quote}&rdquo;</small> : null}
                      </td>
                      <td>
                        {x.contractId ? <Link href={`/contracts/${x.contractId}`}>{x.contractTitle}</Link> : x.contractTitle}
                        {x.clause ? <small className="hint" style={{ display: "block" }}>Clause {x.clause}</small> : null}
                      </td>
                      <td style={{ maxWidth: 360 }}>{x.fairVersion}</td>
                      <td>
                        {x.status === "done" ? (
                          <span style={{ color: "var(--ok)", fontWeight: 600 }}>Done{x.doneBy ? ` · ${x.doneBy}` : ""}</span>
                        ) : (
                          <>
                            <Tag kind="overdue">Approved by {x.approvedBy}</Tag>
                            {canEdit ? (
                              <span style={{ display: "block", marginTop: 6 }}>
                                <MarkTemplateDone id={x.id} />
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="hint">No template fixes yet. When an agency or freelancer agreement on AtliQ&apos;s paper is reviewed, &ldquo;Would we accept this?&rdquo; lets Karandeep approve fixing a clause.</p>
          )}
        </>
      ) : null}

      {tab === "search" ? (
        <>
          <form className="search-form" action="/register" role="search">
            <input type="hidden" name="tab" value="search" />
            <input type="search" name="q" defaultValue={q} placeholder="Try 45 days, liquidated damages, non-compete" aria-label="Search signed contracts" />
            <select name="type" defaultValue={qType} aria-label="Clause type">
              <option value="all">Any clause</option>
              {CLAUSE_TYPES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <select name="status" defaultValue={qStatus} aria-label="Contract status">
              <option value="all">In force and expired</option>
              <option value="in_force">In force only</option>
              <option value="expired">Expired only</option>
            </select>
            <button type="submit" className="btn primary">
              Search
            </button>
          </form>
          {q.trim() ? (
            <>
              <p className="hint">
                {hits.length} clause{hits.length === 1 ? "" : "s"} in {hitContracts} signed contract{hitContracts === 1 ? "" : "s"} · {coverageLine(coverage)}
              </p>
              <div className="panel" style={{ padding: "4px 18px" }}>
                {hits.length ? (
                  hits.map((h) => (
                    <div key={`${h.contractId}-${h.clause}`} className="hit">
                      <span className="dismiss-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                        <span>
                          <Link href={`/contracts/${h.contractId}`}>
                            <b>{h.title}</b>
                          </Link>{" "}
                          <span className="hint">
                            · {/^\d/.test(h.clause) ? `Clause ${h.clause}` : h.clause}
                            {h.signedDate ? ` · signed ${formatDate(h.signedDate)}` : ""}
                          </span>
                        </span>
                        <span className="dismiss-row">
                          {h.type !== "other" ? <Tag>{clauseTypeLabel(h.type)}</Tag> : null}
                          {h.inForce ? null : <SeverityChip sev="neutral">Expired</SeverityChip>}
                        </span>
                      </span>
                      <p>
                        <Highlight text={h.text.length > 700 ? `${h.text.slice(0, 700)}…` : h.text} q={q} />
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="hint">No clause has every one of those words. Try fewer words, or a number on its own.</p>
                )}
              </div>
            </>
          ) : (
            <p className="hint">Every clause of every signed contract on file, expired ones included. Case and punctuation are ignored.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
