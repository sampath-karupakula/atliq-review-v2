// Signed portfolio: the risks AtliQ has already signed, the promises binding it today, what ends soon, and the
// signed contracts the tracker lists that are not on file yet. The risk scan comes from `pnpm portfolio`, stored in
// data/exposure.json (committed, so production needs no AI run); in-force status and dates come from the database.
import type { Metadata } from "next";
import Link from "next/link";
import exposure from "@/data/exposure.json";
import { Kpi, PageHead, SeverityChip, Tag } from "@/components/ui";
import { getSignedContracts } from "@/lib/data/portfolio";
import { getMissingSigned } from "@/lib/data/memory";
import { coverageLine, getCoverage, getRegister } from "@/lib/data/register";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { appToday } from "@/lib/config";
import { daysBetween, formatDate } from "@/lib/checks/dates";
import { clauseLabel, docLabel } from "@/lib/display";
import { commitmentTypeLabel, money } from "@/lib/format";

export const metadata: Metadata = { title: "Signed portfolio" };
export const dynamic = "force-dynamic";

type Finding = { id: string; severity: string; title: string; clause: string | null; foundIn: string | null; quote: string | null; whatItMeans: string; whatItCouldCost: string; howToSoften: string };
type Entry = { file: string; tracker: string; title: string; band: string | null; score: number | null; findings: Finding[] };

export default async function ExposurePage() {
  const data = exposure as unknown as { generatedAt: string | null; model: string | null; entries: Entry[] };
  const [signed, register, coverage, missing, me] = await Promise.all([getSignedContracts(), getRegister(), getCoverage(), getMissingSigned(), getCurrentUser()]);
  const today = appToday();
  const canUpload = can(me, "contract.upload");
  const byFile = new Map(signed.map((s) => [s.sourceFile?.split("/").pop() ?? "", s]));

  const rows = data.entries
    .map((e) => {
      const c = byFile.get(e.file) ?? null;
      const serious = e.findings.filter((f) => f.severity === "serious");
      return { e, c, serious, negotiable: e.findings.filter((f) => f.severity === "negotiable").length };
    })
    .sort((a, b) => Number(b.c?.inForce ?? 0) - Number(a.c?.inForce ?? 0) || b.serious.length - a.serious.length || (b.e.score ?? 0) - (a.e.score ?? 0));
  const inForce = signed.filter((s) => s.inForce);
  const seriousLive = rows.filter((r) => r.c?.inForce).reduce((n, r) => n + r.serious.length, 0);
  const seriousContracts = rows.filter((r) => r.c?.inForce && r.serious.length).length;
  const livePromises = register.filter((r) => r.status !== "expired");
  const endingSoon = inForce.filter((s) => s.ends && daysBetween(today, s.ends) <= 180).sort((a, b) => a.ends!.localeCompare(b.ends!));

  return (
    <section className="wrap page">
      <PageHead eyebrow="AtliQ's memory" title="Signed portfolio" aside={<span className="hint">{coverageLine(coverage)}</span>} />
      <p className="muted" style={{ maxWidth: "68ch", fontSize: 15 }}>
        What AtliQ has already signed: the risks inside, the promises that bind it today, and what ends soon. Risks can only change at renewal or the next amendment.
      </p>
      <div className="kpis">
        <Kpi label="Signed, on file" value={signed.length} sub={`${inForce.length} in force today`} href="/contracts?view=signed" />
        <Kpi label="Serious items already signed" value={seriousLive} sub={`Across ${seriousContracts} contracts in force`} alert={seriousLive > 0} />
        <Kpi label="Promises binding AtliQ" value={livePromises.length} sub={`${livePromises.filter((r) => !r.confirmed).length} not confirmed yet`} href="/register?tab=promises" />
        <Kpi label="Ending within 6 months" value={endingSoon.length} sub="Renewal is the chance to fix terms" href="/deadlines" />
        <Kpi label="Signed but not on file" value={missing.length} sub="Their promises can't be checked" alert={missing.length > 0} />
      </div>

      <section className="queue">
        <div className="sec-head">
          <h2>Risks already signed</h2>
          <p>{data.generatedAt ? `Scanned ${formatDate(data.generatedAt.slice(0, 10))} by ${data.model}` : "Not scanned yet · run pnpm portfolio"}</p>
        </div>
        <div className="panel" style={{ padding: "4px 18px" }}>
          {rows.map(({ e, c, serious, negotiable }) => (
            <details key={e.file} className="hit">
              <summary style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", cursor: "pointer", listStyle: "none" }}>
                <span style={{ minWidth: 0 }}>
                  <b>{c ? <Link href={`/contracts/${c.id}`}>{c.title}</Link> : e.title}</b>
                  <span className="hint" style={{ display: "block" }}>
                    {c?.signedDate ? `Signed ${formatDate(c.signedDate)}` : e.tracker}
                    {c?.ends ? ` · ${c.inForce ? "ends" : "ended"} ${formatDate(c.ends)}` : " · no end date"}
                  </span>
                </span>
                <span className="dismiss-row">
                  {c && !c.inForce ? <SeverityChip sev="neutral">Expired</SeverityChip> : null}
                  {serious.length ? <SeverityChip sev="serious">{`${serious.length} Serious`}</SeverityChip> : <SeverityChip sev="okc">No Serious items</SeverityChip>}
                  {negotiable ? <span className="hint">{negotiable} negotiable</span> : null}
                </span>
              </summary>
              {serious.length ? (
                <ul className="mini-list" style={{ marginTop: 8 }}>
                  {serious.map((f) => (
                    <li key={f.id} style={{ display: "block" }}>
                      <b>{f.title}</b> <span className="hint">{clauseLabel(f.foundIn ?? f.clause)}</span>
                      {f.quote ? (
                        <span className="quote" style={{ display: "block", margin: "6px 0", padding: "6px 8px" }}>
                          {f.quote}
                        </span>
                      ) : null}
                      {f.whatItCouldCost ? <p style={{ margin: "4px 0" }}>{f.whatItCouldCost}</p> : null}
                      {f.howToSoften ? <p className="hint" style={{ margin: 0 }}>At renewal or the next amendment: {f.howToSoften}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Nothing Serious found in this contract.</p>
              )}
            </details>
          ))}
        </div>
      </section>

      <div className="two-col" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 18 }}>
        <section className="queue">
          <div className="sec-head">
            <h2>Promises binding AtliQ</h2>
            <p>
              <Link href="/register?tab=promises">Open the register</Link>
            </p>
          </div>
          <div className="panel" style={{ padding: "4px 18px" }}>
            <ul className="mini-list">
              {livePromises.map((r) => (
                <li key={r.id}>
                  <span style={{ minWidth: 0 }}>
                    <b>{commitmentTypeLabel(r.type)}</b> · {r.contract}
                    <span className="hint" style={{ display: "block" }}>
                      {r.activity}
                    </span>
                  </span>
                  <span className="hint num" style={{ flexShrink: 0 }}>
                    {r.ends ? `to ${formatDate(r.ends)}` : (r.endRule ?? "no end")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="queue">
          <div className="sec-head">
            <h2>Ending within 6 months</h2>
            <p>From {formatDate(today)}</p>
          </div>
          <div className="panel" style={{ padding: "4px 18px" }}>
            {endingSoon.length ? (
              <ul className="mini-list">
                {endingSoon.map((s) => (
                  <li key={s.id}>
                    <Link href={`/contracts/${s.id}`}>{s.title}</Link>
                    <span className="hint num">
                      {formatDate(s.ends!)} · in {daysBetween(today, s.ends!)}d
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">No signed contract ends in the next six months.</p>
            )}
          </div>
        </section>
      </div>

      <section className="queue">
        <div className="sec-head">
          <h2>Signed, but not on file</h2>
          <p>
            {missing.length} in the tracker with no file · {coverage.signedInTracker - coverage.onFile} counted against coverage
          </p>
        </div>
        {missing.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Tracker</th>
                  <th>Counterparty</th>
                  <th>Signed</th>
                  <th>Ends</th>
                  <th>Value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {missing.map((m) => (
                  <tr key={m.trackerId}>
                    <td className="num">{m.trackerId}</td>
                    <td className="co">
                      {m.counterparty}
                      <small>
                        {docLabel(m.docType.toLowerCase().replace(/-\d+$/, ""))}
                        {m.notes ? ` · ${m.notes}` : ""}
                      </small>
                    </td>
                    <td className="num">{m.signedDate ? formatDate(m.signedDate) : "—"}</td>
                    <td className="num">
                      {m.expiry ? formatDate(m.expiry) : "—"}
                      {m.expiry && m.expiry < today ? <Tag>Ended</Tag> : null}
                    </td>
                    <td className="num">{m.valueUsd ? money(m.valueUsd) : "—"}</td>
                    <td>
                      {canUpload ? (
                        <Link className="btn small" href={`/contracts/new?mode=signed&tracker=${m.trackerId}`}>
                          Upload signed copy
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">Every signed contract in the tracker is on file.</p>
        )}
        <p className="hint">Until a file is uploaded, a promise inside it can&apos;t be checked, so every review says how many signed contracts it was checked against.</p>
      </section>
    </section>
  );
}
