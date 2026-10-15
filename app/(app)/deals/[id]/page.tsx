import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumbs, SeverityChip, Tag } from "@/components/ui";
import { CallNoteForm } from "@/components/deal/CallNoteForm";
import { getDeal } from "@/lib/data/deals";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { appToday } from "@/lib/config";
import { daysBetween, formatDate } from "@/lib/checks/dates";
import { isUS } from "@/lib/checks/entityLaw";
import { clauseLabel, docLabel } from "@/lib/display";
import { money } from "@/lib/format";
import type { CheckState } from "@/lib/deal/checklist";

export const metadata: Metadata = { title: "Deal" };
export const dynamic = "force-dynamic";

type Tab = "docs" | "pass" | "notes";
const STATE: Record<CheckState, [string, string]> = {
  signed: ["y", "Signed"],
  reviewed: ["y", "Reviewed"],
  in_review: ["w", "In review"],
  draft: ["w", "Draft"],
  missing: ["n", "Missing"],
  check: ["c", "Check"],
};
const left = (d: number) => (d < 0 ? `${-d} day${d === -1 ? "" : "s"} late` : d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"} left`);

export default async function DealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, getCurrentUser()]);
  const page = await getDeal(id);
  if (!page) notFound();
  const { deal, docs, checklist, complete, gate, conflicts, notes } = page;
  const today = appToday();
  const tab: Tab = sp.tab === "pass" || sp.tab === "notes" ? sp.tab : "docs";
  const contractors = docs.filter((d) => ["freelancer", "subcontract"].includes(d.role) || ["freelancer", "subcontract"].includes(d.docType));
  const passFindings = conflicts.filter((c) => c.check === "pass_down");
  const docConflicts = conflicts.filter((c) => c.check !== "pass_down");
  const counts = Object.entries(
    checklist.reduce<Record<string, number>>((a, i) => {
      a[STATE[i.state][1]] = (a[STATE[i.state][1]] ?? 0) + 1;
      return a;
    }, {}),
  )
    .map(([k, n]) => `${n} ${k.toLowerCase()}`)
    .join(" · ");
  const waiverNeeded = checklist.filter((i) => i.promise && i.state === "missing");
  const reviewers = [...new Set(docs.filter((d) => d.reviewer).map((d) => `${d.reviewer}|${d.reviewDeadline ?? ""}`))];
  const tabs: [Tab, string][] = [
    ["docs", "Documents and conflicts"],
    ["pass", "Pass-down"],
    ["notes", `Call notes · ${notes.length}`],
  ];

  return (
    <section className="wrap page">
      <Crumbs items={[{ href: "/deals", label: "Deals" }, { label: deal.companyName ?? deal.name }]} />
      <h1 className="display">{deal.name}</h1>
      <div className="rep-meta">
        <span>
          {deal.domain} · {deal.clientCountry}
          {deal.phi ? " · patient data" : deal.personalData ? " · personal data" : ""}
        </span>
        {deal.valueUsd !== null ? (
          <span>
            Deal value <b>{money(deal.valueUsd, deal.currency)}</b>
          </span>
        ) : null}
        <span>
          Signing entity <b>{isUS(deal.clientCountry) ? "AtliQ Inc" : "AtliQ Technologies Pvt Ltd"}</b>
        </span>
        <span>
          Deal owner <b>{deal.owner}</b>
        </span>
        {deal.clientDeadline ? (
          <span>
            Client deadline <b>{formatDate(deal.clientDeadline)}</b> ({left(daysBetween(today, deal.clientDeadline))})
          </span>
        ) : null}
      </div>
      <div className="dismiss-row">
        {complete && !waiverNeeded.length ? <SeverityChip sev="okc">Bundle complete</SeverityChip> : <SeverityChip sev="serious">Bundle incomplete</SeverityChip>}
        {waiverNeeded.map((w) => (
          <Tag key={w.key} kind="clash">
            Clashes with a live promise: {w.promise!.contract.split(" —")[0]}{w.promise!.clause ? ` Clause ${w.promise!.clause}` : ""}
          </Tag>
        ))}
        {gate.allowed === false ? <span className="gate no">Data transfer {gate.label.replace(/^Not allowed/, "not allowed")}</span> : null}
      </div>
      <nav className="tabs" aria-label="Deal sections">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/deals/${deal.id}${k === "docs" ? "" : `?tab=${k}`}`} aria-current={tab === k ? "page" : undefined}>
            {l}
          </Link>
        ))}
      </nav>

      <div className="report-grid">
        <div className="rep-main">
          {tab === "docs" ? (
            <>
              <section className="panel">
                <div className="sec-head">
                  <h3>Document checklist</h3>
                  <span className="hint">
                    {checklist.length} required · {counts}
                  </span>
                </div>
                <ul className="checks">
                  {checklist.map((i) => (
                    <li key={i.key}>
                      <span className={`mk ${STATE[i.state][0]}`}>{STATE[i.state][1]}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {i.label}
                        <span className="src">
                          {i.doc ? `${i.doc.title}${i.doc.band ? ` · ${i.doc.band} risk` : ""} · ` : ""}
                          {i.why}
                          {i.note ? ` ${i.note}` : ""}
                        </span>
                      </span>
                      {i.doc ? (
                        <Link className="btn small" href={`/contracts/${i.doc.id}`}>
                          Open
                        </Link>
                      ) : can(me, "contract.upload") ? (
                        <Link className="btn small" href="/contracts/new">
                          Upload
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="group">
                <div className="group-h">
                  <h2>
                    Conflicts found by the reviews <span className="num">{docConflicts.length}</span>
                  </h2>
                </div>
                {docConflicts.length ? (
                  docConflicts.map((c) => (
                    <article key={c.id} className={`conflict${c.severity === "serious" ? " serious" : ""}`}>
                      <h3>{c.title}</h3>
                      <div className="pair">
                        <div>
                          <span className="lbl">
                            {c.contractTitle} · {clauseLabel(c.clause) || "whole document"}
                          </span>
                          {c.quote ? <p className="quote">{c.quote}</p> : <p className="hint">{c.check === "bundle_conflict" ? `Delivery plan on the deal: ${deal.deliveredFrom}${deal.dataTouchers.length ? ` (${deal.dataTouchers.join(", ")})` : ""}.` : "Not found after reading every clause."}</p>}
                        </div>
                        <div>
                          <span className="lbl">
                            {c.docB ?? "AtliQ's rules"}
                            {c.clauseB ? ` · ${clauseLabel(c.clauseB)}` : ""}
                          </span>
                          {c.quoteB ? <p className="quote">{c.quoteB}</p> : <p className="hint">{c.check === "bundle_missing" ? "The document is not in the deal." : "—"}</p>}
                        </div>
                      </div>
                      <div className="scope" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                        {c.whatItMeans ? (
                          <span>
                            <b>What it means:</b> {c.whatItMeans}
                          </span>
                        ) : null}
                        {c.howToSoften ? (
                          <span>
                            <b>Options:</b> {c.howToSoften}
                          </span>
                        ) : null}
                        <Link className="btn small" href={`/contracts/${c.contractId}`} style={{ marginTop: 6 }}>
                          Open the contract findings
                        </Link>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="hint">{docs.some((d) => d.band) ? "No clashes or contradicting documents in the reviews so far." : "No document in this deal has been reviewed yet, so nothing has been compared."}</p>
                )}
              </section>

              <section className="panel">
                <h3>Documents in this deal</h3>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>First review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((d) => (
                        <tr key={d.id}>
                          <td className="co">
                            <Link href={`/contracts/${d.id}`}>{d.title}</Link>
                            <small>v{d.version}</small>
                          </td>
                          <td>{docLabel(d.docType)}</td>
                          <td>
                            {d.isSigned ? (
                              <SeverityChip sev="okc">{`Signed${d.signedDate ? ` ${formatDate(d.signedDate)}` : ""}`}</SeverityChip>
                            ) : d.band ? (
                              <SeverityChip sev={d.band.toLowerCase() as "high" | "medium" | "low"}>{`${d.band} · ${d.score}`}</SeverityChip>
                            ) : (
                              <span className="hint">{d.reviewStatus === "running" ? "AI review running" : "Not reviewed yet"}</span>
                            )}
                          </td>
                          <td>{d.reviewer ? `${d.reviewer}${d.reviewDeadline ? ` · by ${formatDate(d.reviewDeadline)}` : ""}` : <span className="muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}

          {tab === "pass" ? (
            <section className="panel">
              <div className="sec-head">
                <h3>Does the contractor promise what we promised the client?</h3>
              </div>
              {contractors.length ? (
                <>
                  <ul className="checks">
                    {contractors.map((c) => (
                      <li key={c.id}>
                        <span className={`mk ${c.isSigned ? "y" : "c"}`}>{c.isSigned ? "Signed" : "Check"}</span>
                        <span style={{ flex: 1 }}>
                          {c.title}
                          <span className="src">{docLabel(c.docType)} · must match the client contract on IP, confidentiality, data protection and liability (R-PASS)</span>
                        </span>
                        <Link className="btn small" href={`/contracts/${c.id}`}>
                          Open
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {passFindings.map((f) => (
                    <div key={f.id} className="answer warn">
                      <span className="h">
                        <SeverityChip sev={f.severity === "serious" ? "serious" : "negotiable"}>Gap</SeverityChip>
                        {f.title}
                      </span>
                      {f.whatItMeans ? <p>{f.whatItMeans}</p> : null}
                      {f.howToSoften ? <span className="src">Flow-down: {f.howToSoften}</span> : null}
                    </div>
                  ))}
                  <p className="hint">The term-by-term table (client promise vs contractor promise, with flow-down wording to copy) reads both contracts with the AI. It arrives with the AI features in P12.</p>
                </>
              ) : (
                <p className="hint">No contractor or agency documents in this deal, so there is nothing to compare. If a freelancer joins, check the IP clause: AtliQ&apos;s freelancer template lets them keep it.</p>
              )}
            </section>
          ) : null}

          {tab === "notes" ? (
            <>
              <section className="panel">
                <div className="sec-head">
                  <h3>Call notes</h3>
                  <span className="hint">
                    {notes.length} note{notes.length === 1 ? "" : "s"}
                  </span>
                </div>
                {notes.length ? (
                  <div className="answers">
                    {notes.map((n) => (
                      <div key={n.id} className="answer">
                        <span className="h">
                          <SeverityChip sev="neutral">Not compared yet</SeverityChip>
                          {n.approvedBy ?? "Someone"} · {n.title.replace(/^Call on (\d{4}-\d{2}-\d{2})$/, (_, d: string) => `call on ${formatDate(d)}`)}
                        </span>
                        <p>&ldquo;{n.text}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="hint">No notes yet. Add what was said on a call, so a promise made by phone can&apos;t slip into a signed contract unnoticed.</p>
                )}
                <p className="hint">Comparing each note with what the draft says needs the AI, so it arrives in P12. Until then notes are kept here for the reviewer to read.</p>
              </section>
              {can(me, "deal.note") ? <CallNoteForm dealId={deal.id} today={today} /> : null}
            </>
          ) : null}
        </div>

        <aside className="rail">
          <div className="decide">
            <h3>Data transfer</h3>
            <span className={`gate ${gate.allowed === false ? "no" : "yes"}`} style={{ alignSelf: "flex-start" }}>
              {gate.allowed === false ? "Not allowed" : gate.label}
            </span>
            <p style={{ fontSize: 14, margin: 0 }}>
              <b>The rule:</b> {gate.rule}
            </p>
            {gate.quote ? (
              <p style={{ fontSize: 13.5, margin: 0 }}>
                {gate.quote.doc} · {clauseLabel(gate.quote.clause)}: <span className="quote" style={{ display: "block", marginTop: 4, padding: "6px 8px" }}>{gate.quote.text}</span>
              </p>
            ) : null}
            {gate.turnsGreen ? (
              <p style={{ fontSize: 14, margin: 0 }}>
                <b>Turns green when:</b> {gate.turnsGreen}.
              </p>
            ) : null}
            {gate.allowed === false ? (
              <p style={{ fontSize: 14, margin: 0 }}>
                <b>Shown to:</b> {[deal.owner, ...deal.dataTouchers, "Karandeep"].filter((v, i, a) => a.indexOf(v) === i).join(", ")}.
              </p>
            ) : null}
            <p className="guard">The tool can&apos;t see email or file transfers. If data has already arrived, tell Karandeep today.</p>
          </div>
          <div className="score-card">
            <h3>People</h3>
            <ul className="mini-list">
              <li>
                <span>{deal.owner}</span>
                <span className="hint">Deal owner</span>
              </li>
              {reviewers.map((r) => {
                const [name, by] = r.split("|");
                return (
                  <li key={r}>
                    <span>{name}</span>
                    <span className="hint">First review{by ? ` · due ${formatDate(by)}` : ""}</span>
                  </li>
                );
              })}
              {deal.owner !== "Karandeep" ? (
                <li>
                  <span>Karandeep</span>
                  <span className="hint">Decides</span>
                </li>
              ) : null}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
