import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumbs, PageHead, SeverityChip, Tag } from "@/components/ui";
import { QueueTable } from "@/components/contracts/QueueTable";
import { SignedTable } from "@/components/contracts/SignedTable";
import { getCompany } from "@/lib/data/companyView";
import { appToday } from "@/lib/config";
import { formatDate } from "@/lib/checks/dates";
import { commitmentTypeLabel } from "@/lib/format";
import { currentRole } from "@/lib/viewer";

export const dynamic = "force-dynamic";

type Group = "all" | "new" | "active" | "ended";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await getCompany((await params).id);
  return { title: c?.name ?? "Company" };
}

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ g?: string }> }) {
  const [{ id }, sp, role] = await Promise.all([params, searchParams, currentRole()]);
  const c = await getCompany(id);
  if (!c) notFound();
  const today = appToday();
  const g: Group = (["all", "new", "active", "ended"] as const).includes(sp.g as Group) ? (sp.g as Group) : "all";
  const show = (k: Group) => g === "all" || g === k;
  const groups: [Group, string, number][] = [
    ["all", "All", c.open.length + c.active.length + c.ended.length],
    ["new", "New", c.open.length],
    ["active", "Active", c.active.length],
    ["ended", "Ended", c.ended.length],
  ];
  const livePromises = c.promises.filter((p) => p.status !== "expired");

  return (
    <section className="wrap page">
      <Crumbs items={[{ href: "/contracts", label: "Contracts" }, { label: c.name }]} />
      <PageHead
        eyebrow={c.country ?? "Country not recorded"}
        title={c.name}
        aside={role !== "counsel" ? <Link className="btn" href="/contracts/new">Upload a contract</Link> : null}
      />
      <div className="dismiss-row">
        {livePromises.length ? <Tag kind="clash">{`${livePromises.length} live promise${livePromises.length > 1 ? "s" : ""} AtliQ made them`}</Tag> : null}
        {c.clash ? <Tag kind="clash">Clash in an open draft</Tag> : null}
      </div>
      <nav className="vswitch big" aria-label="Show" style={{ alignSelf: "flex-start" }}>
        {groups.map(([k, label, n]) => (
          <Link key={k} href={`/companies/${c.id}?g=${k}`} aria-current={g === k ? "true" : undefined}>
            {label} <span className="num" style={{ opacity: 0.7 }}>{n}</span>
          </Link>
        ))}
      </nav>
      <div className="report-grid">
        <div className="rep-main">
          {show("new") ? (
            <section className="queue">
              <div className="sec-head">
                <h2>
                  <SeverityChip sev="high">New</SeverityChip> <span className="num">{c.open.length}</span>
                </h2>
                <p>In review, not signed yet · soonest deadline first</p>
              </div>
              {c.open.length ? <QueueTable rows={c.open} today={today} /> : <p className="hint">No new contracts here.</p>}
            </section>
          ) : null}
          {show("active") ? (
            <section className="queue">
              <div className="sec-head">
                <h2>
                  <SeverityChip sev="okc">Active</SeverityChip> <span className="num">{c.active.length}</span>
                </h2>
                <p>Signed and in force</p>
              </div>
              <SignedTable rows={c.active} showCompany={false} />
            </section>
          ) : null}
          {show("ended") ? (
            <section className="queue">
              <div className="sec-head">
                <h2>
                  <SeverityChip sev="neutral">Ended</SeverityChip> <span className="num">{c.ended.length}</span>
                </h2>
                <p>Kept for history and search</p>
              </div>
              <SignedTable rows={c.ended} showCompany={false} />
            </section>
          ) : null}
        </div>
        <aside className="side">
          <div className="panel">
            <h3>Promises AtliQ made {c.name.split(" ")[0]}</h3>
            {c.promises.length ? (
              <ul className="mini-list">
                {c.promises.map((p) => (
                  <li key={p.id} style={{ alignItems: "flex-start" }}>
                    <span>
                      <b>
                        {p.id} · {commitmentTypeLabel(p.type)}
                      </b>
                      <br />
                      <span className="hint">{p.quote.length > 140 ? `${p.quote.slice(0, 138)}…` : p.quote}</span>
                    </span>
                    {p.status === "expired" ? (
                      <SeverityChip sev="neutral">Ended {formatDate(p.ends)}</SeverityChip>
                    ) : p.status === "permanent" ? (
                      <SeverityChip sev="high">Permanent</SeverityChip>
                    ) : (
                      <SeverityChip sev="high">Until {formatDate(p.ends)}</SeverityChip>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">No promises to this company on the register.</p>
            )}
            <Link className="btn quiet small" href="/register" style={{ alignSelf: "flex-start" }}>
              Open the register
            </Link>
          </div>
          {c.open.some((o) => o.deadline) ? (
            <div className="panel">
              <h3>Coming up</h3>
              <ul className="mini-list">
                {c.open
                  .filter((o) => o.deadline)
                  .map((o) => (
                    <li key={o.id}>
                      <span>{o.title.split(" — ")[1] ?? o.title}</span>
                      <b className="num">{formatDate(o.deadline)}</b>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
