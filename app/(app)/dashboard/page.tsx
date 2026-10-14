import type { Metadata } from "next";
import { Kpi, PageHead, Stub } from "@/components/ui";
import { ROLES } from "@/lib/roles";
import { currentRole } from "@/lib/viewer";
import { appToday } from "@/lib/config";
import { getQueueRows } from "@/lib/data/queue";
import { getCoverage } from "@/lib/data/register";
import { filterCounts, filterQueue } from "@/lib/queue";
import { formatDate } from "@/lib/checks/dates";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const headline: Record<string, string> = {
  ceo: "Three things need you before the next deadline.",
  reviewer: "Reviews to finish and deals you own.",
  counsel: "Questions waiting for your advice.",
};

export default async function Dashboard() {
  const role = await currentRole();
  const r = ROLES[role];
  const today = appToday();
  const [queue, coverage] = await Promise.all([getQueueRows(), getCoverage()]);
  const counts = filterCounts(queue, today);
  const nearest = filterQueue(queue, "week", "", today)[0];
  const notReviewed = queue.filter((q) => q.reviewState === "not_reviewed").length;
  const missing = coverage.signedInTracker - coverage.onFile;
  const longDate = new Date(today + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className="wrap page">
      <PageHead eyebrow={`${longDate} · viewing as ${r.name}, ${r.title}`} title={headline[role] ?? "Dashboard"} />
      {role !== "counsel" ? (
        <div className="kpis">
          <Kpi value={counts.all} label="Open contracts" sub={`${notReviewed} not reviewed yet`} href="/contracts?view=open" />
          <Kpi value={counts.week} label="Due in 7 days" sub={nearest ? `Nearest: ${formatDate(nearest.deadline)}` : "Nothing this week"} href="/contracts?filter=week" />
          <Kpi
            value={counts.serious}
            label="Serious items open"
            sub={counts.serious ? "These lock the decision" : "None open"}
            href="/contracts?filter=serious"
            alert={counts.serious > 0}
          />
          <Kpi value={counts.clash} label="Live clashes" sub="With promises AtliQ already made" href="/contracts?filter=clash" />
          <Kpi value={`${coverage.onFile} / ${coverage.signedInTracker}`} label="Signed contracts on file" sub={`${missing} missing, so some clashes can't be seen`} href="/contracts?view=signed" />
        </div>
      ) : null}
      <Stub title={`${r.name}'s dashboard`} phase="P7 (the three cards, charts and the review-time plan)" />
    </section>
  );
}
