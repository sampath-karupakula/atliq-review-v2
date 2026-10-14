import Link from "next/link";
import { RowLink } from "./RowLink";
import { SeverityChip, Tag } from "@/components/ui";
import { formatDate } from "@/lib/checks/dates";
import { daysBetween } from "@/lib/checks/dates";
import { deadlineWords } from "@/lib/queue";
import type { CompanySummary } from "@/lib/data/companyView";

function Count({ n, label }: { n: number; label: string }) {
  return n ? (
    <>
      <b className="num">{n}</b> <span className="hint">{label}</span>
    </>
  ) : (
    <span className="muted">—</span>
  );
}

export function CompanyTable({ rows, today }: { rows: CompanySummary[]; today: string }) {
  if (!rows.length)
    return (
      <div className="stub">
        <p>No companies match these filters.</p>
        <Link className="btn small" href="/contracts">
          Clear filters
        </Link>
      </div>
    );
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>New</th>
            <th>Active</th>
            <th>Ended</th>
            <th>Nearest deadline</th>
            <th>Risk</th>
            <th>What needs attention</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const d = c.nearest ? daysBetween(today, c.nearest) : null;
            const live = c.promises.filter((p) => p.status !== "expired").length;
            // The client's own contract speaks for the company, not a freelancer or agency agreement filed under it.
            const first = c.open.find((o) => o.direction === "atliq_supplier") ?? c.open[0];
            return (
              <RowLink key={c.id} href={`/companies/${c.id}`}>
                <td className="co">
                  <Link href={`/companies/${c.id}`} style={{ textDecoration: "none" }}>
                    {c.name}
                  </Link>
                  <small>{c.country ?? "Country not recorded"}</small>
                </td>
                <td>
                  <Count n={c.open.length} label="in review" />
                </td>
                <td>
                  <Count n={c.active.length} label="signed" />
                </td>
                <td>
                  <Count n={c.ended.length} label="ended" />
                </td>
                <td className={`dl${d !== null && d <= 3 ? " soon" : ""}`}>
                  {c.nearest ? (
                    <>
                      <b className="num">{formatDate(c.nearest)}</b>
                      <small>{deadlineWords(d)}</small>
                    </>
                  ) : (
                    <span className="muted">No open deadline</span>
                  )}
                </td>
                <td>
                  <div className="risk">
                    {c.worst ? (
                      <SeverityChip sev={c.worst.toLowerCase() as "high" | "medium" | "low"}>{c.worst}</SeverityChip>
                    ) : c.open.length ? (
                      <SeverityChip sev="neutral">Not reviewed</SeverityChip>
                    ) : null}
                    {c.clash ? <Tag kind="clash">Clash</Tag> : null}
                    {live ? <Tag>{`${live} live promise${live > 1 ? "s" : ""}`}</Tag> : null}
                  </div>
                </td>
                <td style={{ maxWidth: 300, color: "var(--ink-2)" }}>
                  {first ? (first.topIssue ?? `${first.title.split(" — ")[1] ?? first.title}: not reviewed yet`) : <span className="muted">Nothing open</span>}
                </td>
              </RowLink>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
