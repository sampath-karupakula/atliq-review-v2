import type { Metadata } from "next";
import Link from "next/link";
import { PageHead, SeverityChip, Tag } from "@/components/ui";
import { getQueueRows } from "@/lib/data/queue";
import { getRegister } from "@/lib/data/register";
import { appToday } from "@/lib/config";
import { daysBetween, formatDate } from "@/lib/checks/dates";
import { docLabel } from "@/lib/display";
import { commitmentTypeLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Deadlines" };
export const dynamic = "force-dynamic";

type Item = { date: string; kind: "Client deadline" | "Review due" | "Promise ends"; title: string; sub: string; href: string; band?: string | null };

// Every date that matters, from the contracts, the first-review assignments and the register: overdue first, then
// week by week for the next year. Dates are worked out from APP_TODAY.
export default async function DeadlinesPage() {
  const today = appToday();
  const [queue, register] = await Promise.all([getQueueRows(), getRegister()]);
  const items: Item[] = [];
  for (const q of queue.filter((x) => !x.decision)) {
    const name = `${q.companyName ?? q.counterparty} · ${docLabel(q.docType)}`;
    if (q.deadline) items.push({ date: q.deadline, kind: "Client deadline", title: name, sub: q.owner ? `Owner ${q.owner}` : "No owner", href: `/contracts/${q.id}`, band: q.band });
    if (q.reviewDeadline) items.push({ date: q.reviewDeadline, kind: "Review due", title: name, sub: `First review by ${q.reviewer}`, href: `/contracts/${q.id}` });
  }
  for (const r of register.filter((x) => x.ends && x.status === "live")) {
    if (daysBetween(today, r.ends!) <= 365) items.push({ date: r.ends!, kind: "Promise ends", title: `${r.contract} · ${commitmentTypeLabel(r.type)}`, sub: r.activity, href: `/register?tab=promises&f=all#${r.id}` });
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind.localeCompare(b.kind)));

  const groups: { label: string; items: Item[] }[] = [];
  for (const it of items) {
    const d = daysBetween(today, it.date);
    const label = d < 0 ? "Overdue" : d < 7 ? "This week" : d < 14 ? "Next week" : d < 35 ? `Week of ${formatDate(addDays(today, Math.floor(d / 7) * 7))}` : `Later · ${new Date(it.date + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`;
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1)!.items.push(it);
  }

  return (
    <section className="wrap page">
      <PageHead eyebrow={`Today is ${formatDate(today)}`} title="Deadlines" />
      <p className="muted" style={{ maxWidth: "68ch" }}>
        Client deadlines, first reviews due and promises ending within a year, in one timeline. Nothing here needs remembering.
      </p>
      {groups.length ? (
        groups.map((g) => (
          <section key={g.label} className="queue">
            <div className="sec-head">
              <h2 style={{ color: g.label === "Overdue" ? "var(--nego)" : undefined }}>{g.label}</h2>
              <p>
                {g.items.length} date{g.items.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="panel" style={{ padding: "4px 18px" }}>
              <ul className="mini-list">
                {g.items.map((it, i) => {
                  const d = daysBetween(today, it.date);
                  return (
                    <li key={i} style={{ alignItems: "flex-start" }}>
                      <span style={{ display: "flex", gap: 12, alignItems: "baseline", minWidth: 0 }}>
                        <b className="num" style={{ minWidth: 92 }}>
                          {formatDate(it.date)}
                        </b>
                        <span style={{ minWidth: 0 }}>
                          <Link href={it.href} className="lnk" style={{ textDecoration: "none", color: "var(--ink)", fontWeight: 600 }}>
                            {it.title}
                          </Link>
                          <span className="hint" style={{ display: "block" }}>
                            {it.sub}
                          </span>
                        </span>
                      </span>
                      <span className="dismiss-row" style={{ flexShrink: 0 }}>
                        {it.band ? <SeverityChip sev={it.band.toLowerCase() as "high" | "medium" | "low"}>{it.band}</SeverityChip> : null}
                        <Tag kind={it.kind === "Promise ends" ? "fast" : d < 0 ? "overdue" : undefined}>{it.kind}</Tag>
                        <span className="hint num">{d < 0 ? `${-d}d late` : d === 0 ? "today" : `in ${d}d`}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))
      ) : (
        <div className="stub">
          <p>No dates coming up.</p>
        </div>
      )}
    </section>
  );
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
