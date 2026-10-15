import type { Metadata } from "next";
import Link from "next/link";
import { Kpi, PageHead, Panel, SeverityChip } from "@/components/ui";
import { Carousel, type CarouselItem } from "@/components/dashboard/Carousel";
import { DueByWeekChart, Legend, TrendChart, WorkloadBars } from "@/components/dashboard/Charts";
import { TakeButton } from "@/components/dashboard/TakeButton";
import { OfferCheck } from "@/components/offer/OfferCheck";
import { getOfferInputs } from "@/lib/data/offer";
import { counselQuestionsList, reviewTimes } from "@/lib/data/handoff";
import { questionStatus } from "@/lib/review/handoff";
import { TimePlan } from "@/components/handoff/TimePlan";
import { TimeNeededCard } from "@/components/handoff/TimeNeededCard";
import { hm } from "@/lib/review/handoff";
import { StageTracker } from "@/components/report/StageTracker";
import { currentRole } from "@/lib/viewer";
import { getCurrentUser } from "@/lib/auth/session";
import { appToday } from "@/lib/config";
import { getQueueRows } from "@/lib/data/queue";
import { getCoverage } from "@/lib/data/register";
import { dealsOwnedBy, finishedReviewsOf, seriousFlagHistory } from "@/lib/data/dashboard";
import { getContractStage } from "@/lib/data/stage";
import { listPeople } from "@/lib/data/people";
import { decideCard, decideList, firstReviews, dueByWeek, onTime, reviewsToChase, seriousTrend, toAssign, workload } from "@/lib/dashboard";
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

  const decisions = decideList(queue);
  const firsts = firstReviews(queue);
  const teamTimes = await reviewTimes(firsts.map((q) => q.id));
  const timeOf = new Map(teamTimes.map((t) => [t.contractId, t]));
  const decideItems: CarouselItem[] = decisions.map((c, k) => ({
    id: c.id,
    kicker: `${c.decisionRequestedBy ? `${c.decisionRequestedBy} asks for a quick decision · ` : ""}Decide by ${formatDate(c.deadline)} · ${deadlineWords(c.deadline ? daysBetween(today, c.deadline) : null)}`,
    title: name(c),
    note: c.decisionRequestNote,
    body: `${c.seriousOpen ? `${c.seriousOpen} Serious item${c.seriousOpen === 1 ? "" : "s"} open. ` : c.band ? `${c.band} risk. ` : ""}${c.liveClash ? "It breaks a promise AtliQ already made." : c.topIssue ? `${c.topIssue}.` : ""}`,
    href: `/contracts/${c.id}`,
    open: { label: "Open the report", primary: true },
    urgent: k === 0 || !!c.decisionRequestedBy,
  }));
  const firstItems: CarouselItem[] = firsts.map((c) => {
    const d = c.reviewDeadline ? daysBetween(today, c.reviewDeadline) : null;
    const t = timeOf.get(c.id);
    const late = d !== null && d <= 1;
    return {
      id: c.id,
      kicker: d === null ? `First review · ${c.reviewer}` : d < 0 ? `First review overdue · ${-d} day${d === -1 ? "" : "s"}` : `First review due ${d === 0 ? "today" : d === 1 ? "tomorrow" : formatDate(c.reviewDeadline)}`,
      title: name(c),
      body: `${c.reviewer} · ${c.reviewState === "done" ? "AI review done" : "AI review not run yet"}${t ? ` · ${hm(t.left)} left of ${hm(t.est)}` : ""}.${c.deadline ? ` Client deadline ${formatDate(c.deadline)}.` : ""}`,
      href: `/contracts/${c.id}`,
      urgent: d !== null && d < 0,
      remind: late ? { contractId: c.id, who: c.reviewer! } : undefined,
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
        <Carousel label="Decisions waiting" items={decideItems} empty={{ kicker: "Decisions", title: "Nothing is waiting for a decision", body: "Reviewed contracts appear here, quick-decision requests first, then the soonest deadline." }} />
        <Carousel label="First reviews" items={firstItems} empty={{ kicker: "First reviews", title: "No first reviews are open", body: "Assign a contract to start one." }} />
        <Carousel label="Contracts to assign" items={assignItems} empty={{ kicker: "No reviewer yet", title: "Every contract has a reviewer", body: "Nothing to assign." }} />
        <TimeNeededCard times={teamTimes} who="team" planHref="#time-plan" />
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
      <TimePlan times={teamTimes} title="Team review time" sub="Open first reviews" href={(t) => `/contracts/${t.contractId}`} showReviewer />
    </section>
  );
}

async function ReviewerDashboard({ queue, today, longDate, me }: { queue: QueueRow[]; today: string; longDate: string; me: string }) {
  const mine = filterQueue(queue.filter((q) => q.reviewer === me && !q.decision), "all", "", today);
  const dueSoon = mine.filter((q) => q.reviewDeadline && daysBetween(today, q.reviewDeadline) <= 2);
  const [deals, finished, offer, times] = await Promise.all([dealsOwnedBy(me), finishedReviewsOf(me), getOfferInputs(), reviewTimes(mine.map((m) => m.id))]);
  const stages = await Promise.all(deals.map((d) => (d.mainContractId ? getContractStage(d.mainContractId) : Promise.resolve(null))));
  const unassigned = toAssign(queue).filter((q) => q.deadline && daysBetween(today, q.deadline) <= 14);
  const onTimeCount = finished.filter((f) => onTime(f.reviewDeadline, f.completedOn) >= 0).length;
  const timeOf = new Map(times.map((t) => [t.contractId, t]));
  const myReviews: CarouselItem[] = [...mine]
    .sort((a, b) => (a.reviewDeadline ?? "9999").localeCompare(b.reviewDeadline ?? "9999"))
    .map((c) => {
      const d = c.reviewDeadline ? daysBetween(today, c.reviewDeadline) : null;
      const t = timeOf.get(c.id);
      const reviewed = c.reviewState === "done";
      return {
        id: c.id,
        kicker: d === null ? "Your first review" : d < 0 ? `Your review is ${-d} day${d === -1 ? "" : "s"} late` : `Review by ${d === 0 ? "today" : d === 1 ? "tomorrow" : formatDate(c.reviewDeadline)}`,
        title: name(c),
        body: `${reviewed ? "The AI review is done; mark each finding." : "Start the AI review, then mark each finding."}${t ? ` About ${hm(t.left)} left of ${hm(t.est)}.` : ""}${c.deadline ? ` Client deadline ${formatDate(c.deadline)}.` : ""}`,
        href: reviewed ? `/mark/${c.id}` : `/contracts/${c.id}`,
        open: { label: reviewed ? "Mark each finding" : "Start the review", primary: true },
        urgent: d !== null && d < 0,
      };
    });
  // Deals you own that are ready for Karandeep: first review done (or none assigned) and no decision yet.
  const quick: CarouselItem[] = queue
    .filter((q) => q.owner === me && !q.decision && q.reviewState === "done" && (q.decisionRequestedBy || !q.reviewer))
    .sort((a, b) => Number(!!a.decisionRequestedBy) - Number(!!b.decisionRequestedBy) || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"))
    .map((c) => ({
      id: c.id,
      kicker: c.decisionRequestedBy ? "Waiting for Karandeep · you asked for a quick decision" : `Ready for a decision · client deadline ${formatDate(c.deadline)}`,
      title: name(c),
      note: c.decisionRequestNote,
      body: c.decisionRequestedBy
        ? `It leads his decide card.${c.seriousOpen ? ` ${c.seriousOpen} Serious item${c.seriousOpen === 1 ? "" : "s"} must be settled before he can intend to sign.` : ""}`
        : `The first review is done. If the client wants to sign soon, ask Karandeep to decide.${c.seriousOpen ? ` ${c.seriousOpen} Serious item${c.seriousOpen === 1 ? "" : "s"} open.` : ""}`,
      href: `/contracts/${c.id}`,
      open: { label: c.decisionRequestedBy ? "Open" : "Ask for a quick decision", primary: !c.decisionRequestedBy },
      urgent: !c.decisionRequestedBy && !!c.deadline && daysBetween(today, c.deadline) <= 3,
    }));

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
      <ol className="needs">
        <Carousel label="Your first reviews" items={myReviews} empty={{ kicker: "Your first reviews", title: "No reviews assigned to you", body: "Take an unassigned contract from the list on the right." }} />
        <Carousel label="Quick decisions" items={quick} empty={{ kicker: "Quick decisions", title: "Nothing ready for Karandeep", body: "Deals you own appear here once their first review is done, so you can ask him to decide quickly." }} />
        <TimeNeededCard times={times} who="me" planHref="#time-plan" />
      </ol>
      <div className="kpis">
        <Kpi value={mine.length} label="Reviews assigned" sub={mine.map((m) => m.companyName ?? m.counterparty).join(", ") || "None"} href="/contracts?view=mine" />
        <Kpi value={dueSoon.length} label="Due within 2 days" sub={dueSoon[0] ? `${dueSoon[0].companyName}, ${formatDate(dueSoon[0].reviewDeadline)}` : "Nothing urgent"} href="/contracts?view=mine" />
        <Kpi value={deals.length} label="Deals you own" sub={deals.map((d) => d.name.split(" — ")[0]).join(", ") || "None"} href="/deals" />
        <Kpi value={finished.length ? `${onTimeCount} of ${finished.length}` : "—"} label="Last reviews on time" sub={finished.length ? "Against the review-by date" : "No finished reviews yet"} />
      </div>
      <div className="today-grid">
        <div className="queue">
          {times.length ? <TimePlan times={times} title="Your review time" sub="Assigned to you" href={(t) => `/mark/${t.contractId}`} /> : null}
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
  const teamTimes = await reviewTimes(firstReviews(queue).map((q) => q.id));
  const questionItems: CarouselItem[] = waiting
    .map((q) => ({ q, st: questionStatus({ answerBy: q.answerBy, answeredOn: null }, today) }))
    .sort((a, b) => a.st.rank - b.st.rank || (a.q.answerBy ?? "9999").localeCompare(b.q.answerBy ?? "9999"))
    .map(({ q, st }) => ({
      id: q.id,
      kicker: `${st.label}${q.answerBy && st.key === "waiting" ? ` · answer by ${formatDate(q.answerBy)}` : ""}`,
      title: q.contractTitle,
      body: q.question,
      href: "/counsel",
      open: { label: "Answer", primary: true },
      urgent: st.key === "overdue",
    }));
  return (
    <section className="wrap page">
      <PageHead eyebrow={`${longDate} · outside counsel · read-only`} title="Reports to read" />
      <ol className="needs">
        <Carousel label="Questions for you" items={questionItems} empty={{ kicker: "Questions for you", title: "No questions waiting", body: "Questions Karandeep shares with you appear here with their answer-by dates." }} />
        <TimeNeededCard times={teamTimes} who="team" planHref="#time-plan" />
      </ol>
      <div className="kpis">
        <Kpi value={waiting.length} label="Questions waiting for you" sub={late ? `${late} due within 2 days or overdue` : "Nothing urgent"} href="/counsel" alert={late > 0} />
        <Kpi value={toRead.length} label="High-risk reports" sub="Waiting for Karandeep's decision" />
      </div>
      <p className="muted" style={{ maxWidth: "68ch" }}>
        Answer the questions shared with you on the Questions page; answers show on the report and in Karandeep&apos;s tracker. These are the High-risk reports waiting for a decision.
      </p>
      <TimePlan times={teamTimes} title="Review time" sub="First reviews in progress at AtliQ" href={(t) => `/contracts/${t.contractId}`} showReviewer />
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
