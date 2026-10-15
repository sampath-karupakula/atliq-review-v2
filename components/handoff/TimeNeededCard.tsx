// "Review time needed": the total still to spend on open first reviews, from the estimates (document type + 15 min
// per Serious item) minus the minutes already spent, with the split by reviewer. Sits in a dashboard's card row.
import { hm } from "@/lib/review/handoff";
import type { ReviewTime } from "@/lib/data/handoff";
import { TimeBar } from "./TimeBar";

export function TimeNeededCard({ times, who, planHref }: { times: ReviewTime[]; who: "team" | "me"; planHref: string }) {
  const open = times.filter((t) => !t.done);
  const left = open.reduce((a, t) => a + t.left, 0);
  const est = open.reduce((a, t) => a + t.est, 0);
  const spent = open.reduce((a, t) => a + t.spent, 0);
  const over = open.filter((t) => t.over).length;
  const provisional = open.filter((t) => t.basis.includes("provisional")).length;
  const byReviewer = Object.entries(
    open.reduce<Record<string, number>>((a, t) => {
      if (t.reviewer) a[t.reviewer] = (a[t.reviewer] ?? 0) + t.left;
      return a;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  return (
    <li className="need">
      <span className="k">Review time needed</span>
      <h3 className="num" style={{ fontSize: 30 }}>
        {hm(left)}
      </h3>
      <p>
        {open.length
          ? `${who === "me" ? "Left on your" : "Left on"} ${open.length} open first review${open.length === 1 ? "" : "s"}: ${hm(spent)} spent of ${hm(est)} estimated.${over ? ` ${over} over the estimate.` : ""}${provisional ? ` ${provisional} provisional until the AI review runs.` : ""}`
          : who === "me"
            ? "No first reviews assigned to you."
            : "No first reviews are open."}
      </p>
      {open.length ? <TimeBar est={est} spent={spent} max={Math.max(est, spent)} /> : null}
      {who === "team" && byReviewer.length ? (
        <p className="hint" style={{ flex: "none", margin: 0 }}>
          {byReviewer.map(([n, m]) => `${n} ${hm(m)}`).join(" · ")}
        </p>
      ) : null}
      <div className="car-foot">
        <a className="btn small quiet" href={planHref}>
          See the plan
        </a>
      </div>
    </li>
  );
}
