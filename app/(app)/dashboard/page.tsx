import type { Metadata } from "next";
import Link from "next/link";
import { Kpi, PageHead, Panel, SeverityChip } from "@/components/ui";
import { Carousel, type CarouselItem } from "@/components/dashboard/Carousel";
import { DueByWeekChart, Legend, TrendChart, WorkloadBars } from "@/components/dashboard/Charts";
import { TakeButton } from "@/components/dashboard/TakeButton";
import { OfferCheck } from "@/components/offer/OfferCheck";
import { getOfferInputs } from "@/lib/data/offer";
import { counselQuestionsList, reviewTimes } from "@/lib/data/handoff";
import { questionStatus, hm } from "@/lib/review/handoff";
import { TimeBar } from "@/components/handoff/TimeBar";
import { StageTracker } from "@/components/report/StageTracker";
import { currentRole } from "@/lib/viewer";
import { getCurrentUser } from "@/lib/auth/session";
import { appToday } from "@/lib/config";
import { getQueueRows } from "@/lib/data/queue";
import { getCoverage } from "@/lib/data/register";
import { dealsOwnedBy, finishedReviewsOf, seriousFlagHistory } from "@/lib/data/dashboard";
import { getContractStage } from "@/lib/data/stage";
import { listPeople } from "@/lib/data/people";
import { decideCard, dueByWeek, onTime, reviewsToChase, seriousTrend, toAssign, workload } from "@/lib/dashboard";
import { deadlineWords, filterCounts, filterQueue, type QueueRow } from "@/lib/queue";
import { daysBetween, formatDate } from "@/lib/checks/dates";
import { docLabel } from "@/lib/display";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const name = (r: QueueRow) => `${r.companyName ?? r.counterparty} · ${docLabel(r.docType)}`;
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default async function Dashboard() {
  const [role, user] = await Promise.all([currentRole(), getCurrentUser()]);
  const today = appToday();
  const longDate = new Date(today + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const [queue, coverage] = await Promise.all([getQueueRows(), getCoverage()]);
  if (role === "ceo") return <CeoDashboard queue={queue} coverage={coverage} today={today} longDate={longDate} />;
  if (role === "reviewer") return <ReviewerDashboard queue={queue} today={today} longDate={longDate} me={user.name} />;
  return <CounselDashboard queue={queue} longDate={longDate} today={today} />;
}

async function CeoDashboard({ queue, coverage, today, longDate }: { queue: QueueRow[]; coverage: { onFile: number; signedInTracker: number }; today: string; longDate: string }) {
  const counts = filterCounts(queue, today);
  const decide = decideCard(queue);
  const chase = reviewsToChase(queue, today);
  const assign = toAssign(queue);
  const [people, flags] = await Promise.all([listPeople({ roles: ["reviewer"] }), seriousFlagHistory()]);
  // The trend measures real activity (when reviews actually ran), so its window ends on the real date, not on the
  // dataset's APP_TODAY that drives deadlines and live/expired status.
  const trend = seriousTrend(flags, new Date().toISOString().slice(0, 10));
  const seriousItems = queue.reduce((a, q) => a + (q.decision ? 0 : q.seriousOpen), 0);
  const kept = flags.filter((f) => !f.dismissed).length;
  const keptPct = flags.length ? Math.round((kept / flags.length) * 100) : null;
  const nearest = filterQueue(queue, "week", "", today)[0];
  const notReviewed = queue.filter((q) => q.reviewState === "not_reviewed").length;
  const things = [decide, chase[0], assign[0]].filter(Boolean).length;
  const missing = coverage.signedInTracker - coverage.onFile;

  const chaseItems: CarouselItem[] = chase.map((c) => {
    const d = daysBetween(today, c.reviewDeadline!);
    return {
      id: c.id,
      kicker: d < 0 ? `First review overdue · ${-d} day${d === -1 ? "" : "s"}` : `First review due ${d === 0 ? "today" : "tomorrow"}`,
      title: name(c),
      body: `${c.reviewer}'s review ${d < 0 ? "was" : "is"} due ${formatDate(c.reviewDeadline)}. Client deadline ${formatDate(c.deadline)}.`,
      href: `/contracts/${c.id}`,
      remind: { contractId: c.id, who: c.reviewer! },
    };
  });
  const assignItems: CarouselItem[] = assign.map((c) => ({
    id: c.id,
    kicker: `No reviewer yet · ${assign.length} contract${assign.length === 1 ? "" : "s"}`,
    title: name(c),
    body: `Client deadline ${formatDate(c.deadline)}, ${deadlineWords(c.deadline ? daysBetween(today, c.deadline) : null)}. ${c.band ? `${c.band} risk${c.topIssue ? `: ${c.topIssue}` : ""}.` : "Not reviewed by the AI yet."}`,
    href: `/contracts/${c.id}`,
  }));

  return (
    <section className="wrap page">
      <div className="today-head">
        <div>
          <p className="eyebrow">{longDate}</p>
          <h1 className="display">{things ? `${things === 1 ? "One thing needs" : `${things === 2 ? "Two" : "Three"} things need`} you${decide?.deadline ? ` before ${formatDate(decide.deadline).replace(/ \d{4}$/, "")}` : ""}.` : "Nothing needs you right now."}</h1>
        </div>
        <p className="trust" title="Of all Serious flags raised, the share nobody dismissed as a false alarm.">
          Serious flags kept: <b className="num">{keptPct === null ? "—" : `${keptPct}%`}</b>
          <span>target 80%</span>
        </p>
      </div>

      <ol className="needs">
        {decide ? (
          <li className="need first">
            <span className="k">
              Decide by {formatDate(decide.deadline)} · {deadlineWords(decide.deadline ? daysBetween(today, decide.deadline) : null)}
            </span>
            <h3>{name(decide)}</h3>
            <p>
              {decide.seriousOpen ? `${decide.seriousOpen} Serious item${decide.seriousOpen === 1 ? "" : "s"} open. ` : decide.band ? `${decide.band} risk. ` : ""}
              {decide.liveClash ? "It breaks a promise AtliQ already made. " : decide.topIssue ? `${decide.topIssue}.` : ""}
            </p>
            <div>
              <Link className="btn primary" href={`/contracts/${decide.id}`}>
                Open the report
              </Link>
            </div>
          </li>
        ) : (
          <li className="need">
            <span className="k">Decisions</span>
            <h3>Nothing is waiting for a decision</h3>
            <p>Reviewed contracts appear here, soonest deadline first.</p>
          </li>
        )}
        <Carousel label="Reviews to chase" items={chaseItems} empty={{ kicker: "First reviews", title: "All first reviews are on track", body: "Nothing is overdue or due tomorrow." }} />
        <Carousel label="Contracts to assign" items={assignItems} empty={{ kicker: "No reviewer yet", title: "Every contract has a reviewer", body: "Nothing to assign." }} />
      </ol>

      <div className="kpis">
        <Kpi value={counts.all} label="Open contracts" sub={`${notReviewed} not reviewed yet`} href="/contracts?view=open" />
        <Kpi value={counts.week} label="Due in 7 days" sub={nearest ? `Nearest: ${formatDate(nearest.deadline)}` : "Nothing this week"} href="/contracts?filter=week" />
        <Kpi
          value={seriousItems}
          label="Serious items open"
          sub={seriousItems ? `Across ${counts.serious} contract${counts.serious === 1 ? "" : "s"} · they lock the decision` : "None open"}
          href="/contracts?filter=serious"
          alert={seriousItems > 0}
        />
        <Kpi value={counts.clash} label="Live clashes" sub="With promises AtliQ already made" href="/contracts?filter=clash" />
        <Kpi value={`${coverage.onFile} / ${coverage.signedInTracker}`} label="Signed contracts on file" sub={`${missing} missing, so some clashes can't be seen`} href="/contracts?view=signed" />
      </div>

      <div className="dash-grid">
        <Panel title="When contracts are due" aside={<span className="hint">By week, coloured by risk</span>}>
          <DueByWeekChart weeks={dueByWeek(queue, today)} />
          <Legend items={[["High", "var(--serious)"], ["Medium", "var(--nego)"], ["Low", "var(--ok)"], ["Not reviewed", "var(--ink-3)"]]} />
        </Panel>
        <Panel title="Reviewer workload" aside={<span className="hint">Open first reviews</span>}>
          <WorkloadBars rows={workload(queue, people.map((p) => p.name), today)} />
          <Legend items={[["On track", "var(--accent)"], ["Overdue", "var(--nego)"]]} />
        </Panel>
        <Panel title="Are Serious flags real?" aside={<span className="hint">Share kept, last 8 weeks</span>}>
          <TrendChart points={trend} />
          <p className="hint">A flag dismissed as a false alarm counts against it. If the line drops below the target, the rules need tuning before people stop listening.</p>
        </Panel>
      </div>
    </section>
  );
}

async function ReviewerDashboard({ queue, today, longDate, me }: { queue: QueueRow[]; today: string; longDate: string; me: string }) {
  const mine = filterQueue(queue.filter((q) => q.reviewer === me && !q.decision), "all", "", today);
  const dueSoon = mine.filter((q) => q.reviewDeadline && daysBetween(today, q.reviewDeadline) <= 2);
  const [deals, finished, offer, times] = await Promise.all([dealsOwnedBy(me), finishedReviewsOf(me), getOfferInputs(), reviewTimes(mine.map((m) => m.id))]);
  const plan = [...times].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const planMax = Math.max(60, ...plan.map((t) => Math.max(t.est, t.spent)));
  const stages = await Promise.all(deals.map((d) => (d.mainContractId ? getContractStage(d.mainContractId) : Promise.resolve(null))));
  const unassigned = toAssign(queue).filter((q) => q.deadline && daysBetween(today, q.deadline) <= 14);
  const onTimeCount = finished.filter((f) => onTime(f.reviewDeadline, f.completedOn) >= 0).length;

  return (
    <section className="wrap page">
      <PageHead
        eyebrow={`${longDate} · ${me}, reviewer and deal owner`}
        title={`${mine.length ? `${mine.length} review${mine.length === 1 ? "" : "s"} to finish` : "No reviews waiting"} and ${deals.length} deal${deals.length === 1 ? "" : "s"} you own.`}
        aside={
          <Link className="btn primary" href="/offer">
            Can I offer this?
          </Link>
        }
      />
      <div className="kpis">
        <Kpi value={mine.length} label="Reviews assigned" sub={mine.map((m) => m.companyName ?? m.counterparty).join(", ") || "None"} href="/contracts?view=mine" />
        <Kpi value={dueSoon.length} label="Due within 2 days" sub={dueSoon[0] ? `${dueSoon[0].companyName}, ${formatDate(dueSoon[0].reviewDeadline)}` : "Nothing urgent"} href="/contracts?view=mine" />
        <Kpi value={deals.length} label="Deals you own" sub={deals.map((d) => d.name.split(" — ")[0]).join(", ") || "None"} href="/deals" />
        <Kpi value={finished.length ? `${onTimeCount} of ${finished.length}` : "—"} label="Last reviews on time" sub={finished.length ? "Against the review-by date" : "No finished reviews yet"} />
      </div>
      <div className="today-grid">
        <div className="queue">
          {plan.length ? (
            <section className="panel">
              <div className="sec-head">
                <h3>Your review time</h3>
                <span className="hint">
                  Assigned to you · <b className="num">{hm(plan.reduce((a, t) => a + t.left, 0))}</b> of review left
                </span>
              </div>
              <div className="tplan">
                {plan.map((t) => (
                  <Link key={t.contractId} className="tp-row" href={`/mark/${t.contractId}`}>
                    <span className="tp-name">
                      <b>{t.title}</b>
                      <small>
                        {t.due ? `due ${formatDate(t.due)}` : "no date"} · {t.basis}
                      </small>
                    </span>
                    <span className="tp-num num">
                      {t.spent ? `${hm(t.spent)} / ` : ""}
                      {hm(t.est)}
                      <small>{t.done ? "done" : t.over ? `over by ${hm(t.spent - t.est)}` : `${hm(t.left)} left`}</small>
                    </span>
                    <TimeBar est={t.est} spent={t.spent} max={planMax} />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
          <div className="sec-head">
            <h2>Deals you own</h2>
            <p>From draft to signature</p>
          </div>
          {deals.length ? (
            deals.map((d, i) => (
              <article key={d.dealId} className="deal">
                <div className="top">
                  <div>
                    <h3>{d.name}</h3>
                    <p className="hint">
                      {d.docs} document{d.docs === 1 ? "" : "s"} · client deadline {formatDate(d.deadline)}
                    </p>
                  </div>
                  <span className="dismiss-row">
                    <Link className="btn small quiet" href={`/deals/${d.dealId}`}>
                      Deal
                    </Link>
                    {d.mainContractId ? (
                      <Link className="btn small" href={`/contracts/${d.mainContractId}`}>
                        Open
                      </Link>
                    ) : null}
                  </span>
                </div>
                {stages[i] ? <StageTracker stage={stages[i]!.stage} round={stages[i]!.facts.round} /> : <p className="hint">Every document in this deal is signed.</p>}
              </article>
            ))
          ) : (
            <div className="stub">
              <p>You don&apos;t own any deals yet.</p>
            </div>
          )}
        </div>
        <aside className="side">
          <Panel title="Quick check before a call">
            <OfferCheck promises={offer.promises} terms={offer.terms} coverage={offer.coverage} compact />
          </Panel>
          <Panel title="Unassigned, due within 14 days">
            {unassigned.length ? (
              <ul className="mini-list">
                {unassigned.map((u) => (
                  <li key={u.id}>
                    <span>
                      <Link href={`/contracts/${u.id}`}>{name(u)}</Link>
                      <br />
                      <span className="hint">Due {formatDate(u.deadline)}</span>
                    </span>
                    <TakeButton contractId={u.id} label={name(u)} reviewBy={daysBetween(today, u.deadline!) > 3 ? addDays(u.deadline!, -2) : addDays(today, 1)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Nothing unassigned is due soon.</p>
            )}
          </Panel>
          <Panel title="Your last reviews">
            {finished.length ? (
              <ul className="mini-list">
                {finished.map((f, i) => {
                  const d = onTime(f.reviewDeadline, f.completedOn);
                  return (
                    <li key={i}>
                      <span>{f.title}</span>
                      <span className="hint" style={{ color: d < 0 ? "var(--nego)" : undefined }}>
                        {d > 0 ? `${d} day${d === 1 ? "" : "s"} early` : d === 0 ? "On the day" : `${-d} day${d === -1 ? "" : "s"} late`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="hint">Reviews you mark done appear here, early or late against their review-by date.</p>
            )}
          </Panel>
          <Panel title="Quick check before a call">
            <p className="hint">Type a term you&apos;re about to offer and see whether it breaks a promise or AtliQ&apos;s usual terms.</p>
            <Link className="btn small" href="/offer" style={{ alignSelf: "flex-start" }}>
              Open Can I offer this?
            </Link>
          </Panel>
        </aside>
      </div>
    </section>
  );
}

async function CounselDashboard({ queue, longDate, today }: { queue: QueueRow[]; longDate: string; today: string }) {
  const toRead = queue.filter((q) => q.reviewState === "done" && q.band === "High" && !q.decision);
  const waiting = (await counselQuestionsList()).filter((q) => !q.answer);
  const late = waiting.filter((q) => ["overdue", "soon"].includes(questionStatus({ answerBy: q.answerBy, answeredOn: null }, today).key)).length;
  return (
    <section className="wrap page">
      <PageHead eyebrow={`${longDate} · outside counsel · read-only`} title="Reports to read" />
      <div className="kpis">
        <Kpi value={waiting.length} label="Questions waiting for you" sub={late ? `${late} due within 2 days or overdue` : "Nothing urgent"} href="/counsel" alert={late > 0} />
        <Kpi value={toRead.length} label="High-risk reports" sub="Waiting for Karandeep's decision" />
      </div>
      <p className="muted" style={{ maxWidth: "68ch" }}>
        Answer the questions shared with you on the Questions page; answers show on the report and in Karandeep&apos;s tracker. These are the High-risk reports waiting for a decision.
      </p>
      <div className="cards2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {toRead.length ? (
          toRead.map((q) => (
            <article key={q.id} className="deal">
              <div className="top">
                <SeverityChip sev="high">High</SeverityChip>
                <span className="hint">Client deadline {formatDate(q.deadline)}</span>
              </div>
              <h3>{name(q)}</h3>
              <p style={{ fontSize: 14, color: "var(--ink-2)" }}>{q.topIssue}</p>
              <div>
                <Link className="btn small" href={`/contracts/${q.id}`}>
                  Read the report
                </Link>
              </div>
            </article>
          ))
        ) : (
          <div className="stub">
            <p>No High-risk reports are waiting.</p>
          </div>
        )}
      </div>
    </section>
  );
}
