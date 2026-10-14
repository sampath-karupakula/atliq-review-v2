// Dismiss rate (meeting 2: "reduce false alarms over time — track the share of flags Karandeep dismisses").
// Counts findings on each contract's latest finished review; history/info items are not flags.
import { getSql } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/checks/dates";
import { Card, PageTitle } from "@/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Insights" };
import { CHECK_NAME, topicOf } from "@/lib/ux/topics";

export const dynamic = "force-dynamic";

type Row = { check: string; category: string | null; severity: string; dismissed: boolean; dismissed_by: string | null; week: string | null; reason: string | null; title: string; contract: string };

const SEV_LABEL: Record<string, string> = { serious: "Serious", negotiable: "Negotiable", minor: "Minor", not_sure: "Not sure" };

function Bar({ label, total, dismissed }: { label: string; total: number; dismissed: number }) {
  const pct = total ? Math.round((dismissed / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(8rem,12rem)_1fr_5.5rem] items-center gap-3 text-sm">
      <span className="truncate">{label}</span>
      <div className="h-2.5 rounded-full bg-surface-2" role="img" aria-label={`${pct}% dismissed`}>
        <div className="h-2.5 rounded-full bg-negotiable" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right tabular-nums text-muted">
        {dismissed}/{total} · {pct}%
      </span>
    </div>
  );
}

function group(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, { total: number; dismissed: number }>();
  for (const r of rows) {
    const k = key(r);
    const g = m.get(k) ?? { total: 0, dismissed: 0 };
    g.total += 1;
    if (r.dismissed) g.dismissed += 1;
    m.set(k, g);
  }
  return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
}

export default async function InsightsPage() {
  await requireUser();
  const rows = await getSql()<Row[]>`
    with latest as (
      select distinct on (contract_id) id, contract_id from reviews where status = 'done' order by contract_id, started_at desc
    )
    select f.check, f.category, f.severity, f.dismissed, f.dismissed_by,
           to_char(date_trunc('week', f.dismissed_at), 'YYYY-MM-DD') as week, f.dismiss_reason as reason, f.title, c.title as contract
    from findings f join latest l on l.id = f.review_id join contracts c on c.id = l.contract_id
    where f.severity <> 'info'`;
  const total = rows.length;
  const dismissed = rows.filter((r) => r.dismissed).length;
  const pct = total ? Math.round((dismissed / total) * 100) : 0;
  const recent = rows.filter((r) => r.dismissed).slice(0, 12);

  return (
    <section className="wrap page">
      <PageTitle title="Insights" subtitle="How often flags turn out to be false alarms. A high dismiss rate for a check is a signal to tune its rule or prompt." />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-3xl font-semibold tabular-nums">{pct}%</div>
          <div className="text-sm text-muted">of flags dismissed</div>
        </Card>
        <Card className="p-4">
          <div className="text-3xl font-semibold tabular-nums">{total}</div>
          <div className="text-sm text-muted">flags on the latest reviews</div>
        </Card>
        <Card className="p-4">
          <div className="text-3xl font-semibold tabular-nums">{dismissed}</div>
          <div className="text-sm text-muted">dismissed with a reason</div>
        </Card>
      </div>
      {total === 0 ? (
        <p className="mt-6 text-sm text-muted">No reviewed contracts yet. Review a contract from the queue, then dismiss false alarms with a reason; the rates appear here.</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="space-y-2 p-4">
            <h2 className="mb-2 font-semibold">By topic</h2>
            {group(rows, (r) => topicOf(r)).map(([k, g]) => (
              <Bar key={k} label={k} {...g} />
            ))}
            <h2 className="mb-2 mt-5 font-semibold">By kind of check</h2>
            <p className="-mt-1 mb-2 text-xs text-muted">Which rule or prompt raised the flag; a high rate here means that check needs tuning.</p>
            {group(rows, (r) => r.check).map(([k, g]) => (
              <Bar key={k} label={CHECK_NAME[k] ?? k} {...g} />
            ))}
          </Card>
          <Card className="space-y-2 p-4">
            <h2 className="mb-2 font-semibold">By severity</h2>
            {group(rows, (r) => r.severity).map(([k, g]) => (
              <Bar key={k} label={SEV_LABEL[k] ?? k} {...g} />
            ))}
            <h2 className="mb-2 mt-5 font-semibold">Dismissals by week</h2>
            {group(rows.filter((r) => r.dismissed && r.week), (r) => r.week!).length ? (
              group(rows.filter((r) => r.dismissed && r.week), (r) => r.week!)
                .sort((a, b) => (a[0] < b[0] ? -1 : 1))
                .map(([k, g]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span>Week of {formatDate(k)}</span>
                    <span className="tabular-nums text-muted">{g.total}</span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-muted">No dismissals yet.</p>
            )}
          </Card>
          <Card className="p-4 lg:col-span-2">
            <h2 className="mb-2 font-semibold">Recent dismissals</h2>
            {recent.length ? (
              <ul className="space-y-2 text-sm">
                {recent.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium">{r.title}</span> <span className="text-muted">({r.contract})</span>
                    <div className="text-muted">
                      {r.dismissed_by}: {r.reason}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">None yet.</p>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
