// Activity: the audit log — who dismissed, accepted, decided, assigned, commented, confirmed or edited what, and
// when. Filters are links (shareable URLs). Newest first, grouped by day.
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contracts, deals } from "@/lib/db/schema";
import { listEvents } from "@/lib/data/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { listPeople } from "@/lib/data/people";
import { ResetDemoButton } from "@/components/ResetDemoButton";
import { Card, PageTitle, Pill } from "@/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Activity" };

export const dynamic = "force-dynamic";

const KINDS: { key: string; label: string; prefix?: string }[] = [
  { key: "all", label: "Everything" },
  { key: "finding", label: "Findings", prefix: "finding." },
  { key: "decision", label: "Decisions", prefix: "decision." },
  { key: "negotiation", label: "Negotiation", prefix: "negotiation." },
  { key: "pushback", label: "Pushback", prefix: "pushback." },
  { key: "review", label: "Reviews", prefix: "review." },
  { key: "register", label: "Register", prefix: "commitment." },
  { key: "waiver", label: "Waivers", prefix: "waiver." },
  { key: "precedent", label: "Precedents", prefix: "precedent." },
  { key: "deal", label: "Deals", prefix: "deal." },
  { key: "contract", label: "Contract edits", prefix: "contract." },
];

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
  "finding.dismiss": { label: "Dismissed", cls: "bg-surface-2 text-muted" },
  "finding.dismiss_many": { label: "Dismissed", cls: "bg-surface-2 text-muted" },
  "finding.restore": { label: "Restored", cls: "bg-surface-2 text-fg" },
  "finding.accept": { label: "Accepted risk", cls: "bg-negotiable-bg text-negotiable" },
  "finding.withdraw": { label: "Withdrew", cls: "bg-surface-2 text-fg" },
  "finding.comment": { label: "Comment", cls: "bg-surface-2 text-fg" },
  "decision.set": { label: "Decision", cls: "bg-ok-bg text-ok" },
  "review.assign": { label: "Assigned", cls: "bg-surface-2 text-fg" },
  "review.assign_done": { label: "Review done", cls: "bg-ok-bg text-ok" },
  "review.start": { label: "Review started", cls: "bg-info-bg text-info" },
  "review.cancel": { label: "Review stopped", cls: "bg-surface-2 text-muted" },
  "review.resume": { label: "Review resumed", cls: "bg-info-bg text-info" },
  "deal.edit": { label: "Deal edited", cls: "bg-surface-2 text-fg" },
  "contract.edit": { label: "Contract edited", cls: "bg-surface-2 text-fg" },
  "contract.delete": { label: "Contract deleted", cls: "bg-serious-bg text-serious" },
  "contract.delete_request": { label: "Deletion asked", cls: "bg-negotiable-bg text-negotiable" },
  "contract.delete_decline": { label: "Deletion declined", cls: "bg-surface-2 text-fg" },
  "decision.request": { label: "Quick decision asked", cls: "bg-info-bg text-info" },
  "review.second": { label: "Second review", cls: "bg-surface-2 text-fg" },
  "counsel.ask": { label: "Counsel asked", cls: "bg-info-bg text-info" },
  "counsel.answer": { label: "Counsel answered", cls: "bg-ok-bg text-ok" },
  "counsel.nudge": { label: "Counsel nudged", cls: "bg-surface-2 text-fg" },
  "commitment.confirm": { label: "Register", cls: "bg-surface-2 text-fg" },
  "commitment.add": { label: "Register", cls: "bg-surface-2 text-fg" },
  "commitment.edit": { label: "Register", cls: "bg-surface-2 text-fg" },
  "waiver.add": { label: "Waiver", cls: "bg-surface-2 text-fg" },
  "precedent.label": { label: "Precedent label", cls: "bg-surface-2 text-fg" },
  "demo.reset": { label: "Demo reset", cls: "bg-serious-bg text-serious" },
  "negotiation.conditions": { label: "Rejected as written", cls: "bg-negotiable-bg text-negotiable" },
  "negotiation.drop": { label: "Condition", cls: "bg-surface-2 text-fg" },
  "pushback.sent": { label: "Pushback sent", cls: "bg-info-bg text-info" },
  "pushback.undo": { label: "Pushback", cls: "bg-surface-2 text-muted" },
  "signed.upload": { label: "Signed contracts", cls: "bg-ok-bg text-ok" },
};

const dayLabel = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeLabel = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ who?: string; kind?: string }> }) {
  const { who, kind } = await searchParams;
  const people = (await listPeople({ includeInactive: true })).map((p) => p.name);
  const person = people.find((p) => p === who);
  const k = KINDS.find((x) => x.key === kind) ?? KINDS[0];
  const [events, viewer] = await Promise.all([listEvents({ actor: person, actionPrefix: k.prefix, limit: 300 }), getCurrentUser()]);

  const contractIds = [...new Set(events.map((e) => e.contractId).filter(Boolean))] as string[];
  const dealIds = [...new Set(events.map((e) => e.dealId).filter(Boolean))] as string[];
  const [cs, ds] = await Promise.all([
    contractIds.length ? getDb().select({ id: contracts.id, counterparty: contracts.counterparty, docType: contracts.docType }).from(contracts).where(inArray(contracts.id, contractIds)) : [],
    dealIds.length ? getDb().select({ id: deals.id, name: deals.name }).from(deals).where(inArray(deals.id, dealIds)) : [],
  ]);
  const contractName = new Map(cs.map((c) => [c.id, `${c.counterparty} · ${c.docType.toUpperCase()}`]));
  const dealName = new Map(ds.map((d) => [d.id, d.name]));

  const days: { day: string; items: typeof events }[] = [];
  for (const e of events) {
    const day = dayLabel(e.at);
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1)!.items.push(e);
  }
  const href = (w?: string, kk?: string) => {
    const q = new URLSearchParams();
    if (w) q.set("who", w);
    if (kk && kk !== "all") q.set("kind", kk);
    const s = q.toString();
    return `/activity${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) => `tap inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium ${active ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-fg"}`;

  return (
    <section className="wrap page">
      <PageTitle
        title="Activity"
        subtitle="Who did what, and when: dismissals, accepted risks, decisions, assignments, comments, register and deal changes."
        actions={can(viewer, "demo.reset") ? <ResetDemoButton /> : undefined}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Person</span>
        <Link href={href(undefined, k.key)} className={chip(!person)}>
          Everyone
        </Link>
        {people.map((p) => (
          <Link key={p} href={href(p, k.key)} className={chip(person === p)}>
            {p}
          </Link>
        ))}
        <span className="ml-3 text-xs text-muted">Kind</span>
        {KINDS.map((x) => (
          <Link key={x.key} href={href(person, x.key)} className={chip(k.key === x.key)}>
            {x.label}
          </Link>
        ))}
      </div>

      {days.length === 0 ? (
        <Card className="p-6 text-sm text-muted">Nothing recorded yet{person || k.prefix ? " for these filters" : ""}. Actions appear here as people review contracts.</Card>
      ) : (
        <div className="space-y-6">
          {days.map((d) => (
            <section key={d.day}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{d.day}</h2>
              <Card className="divide-y divide-line">
                {d.items.map((e) => {
                  const a = ACTION_LABEL[e.action] ?? { label: e.action, cls: "bg-surface-2 text-muted" };
                  return (
                    <div key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm">
                      <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-muted">{timeLabel(e.at)}</span>
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent" title={e.actor}>
                        {e.actor.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{e.actor}</span>
                          <Pill className={a.cls}>{a.label}</Pill>
                          {e.contractId && contractName.has(e.contractId) && (
                            <Link href={`/contracts/${e.contractId}${e.findingId ? `#finding-${e.findingId}` : ""}`} className="text-xs text-accent hover:underline">
                              {contractName.get(e.contractId)}
                            </Link>
                          )}
                          {e.dealId && dealName.has(e.dealId) && (
                            <Link href={`/deals/${e.dealId}`} className="text-xs text-accent hover:underline">
                              {dealName.get(e.dealId)}
                            </Link>
                          )}
                          {e.commitmentId && (
                            <Link href="/register" className="text-xs text-accent hover:underline">
                              {e.commitmentId}
                            </Link>
                          )}
                          {(e.detail as { backfilled?: boolean }).backfilled && <span className="text-[11px] text-muted">(recorded before the log existed)</span>}
                        </div>
                        <p className="mt-0.5 break-words text-muted">{e.text}</p>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
