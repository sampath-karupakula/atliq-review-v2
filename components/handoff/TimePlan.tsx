// Review time, contract by contract, soonest review-by date first: the light bar is the estimate (document type +
// 15 minutes per Serious item), the dark bar the minutes already spent on the marking screen, amber when over.
import Link from "next/link";
import { formatDate } from "@/lib/checks/dates";
import { hm } from "@/lib/review/handoff";
import type { ReviewTime } from "@/lib/data/handoff";
import { Legend } from "@/components/dashboard/Charts";
import { TimeBar } from "./TimeBar";

export function TimePlan({ times, title, sub, href, showReviewer }: { times: ReviewTime[]; title: string; sub: string; href: (t: ReviewTime) => string; showReviewer?: boolean }) {
  const plan = [...times].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const max = Math.max(60, ...plan.map((t) => Math.max(t.est, t.spent)));
  const left = plan.reduce((a, t) => a + t.left, 0);
  const byReviewer = showReviewer
    ? Object.entries(
        plan.reduce<Record<string, number>>((a, t) => {
          if (t.reviewer) a[t.reviewer] = (a[t.reviewer] ?? 0) + t.left;
          return a;
        }, {}),
      ).sort((a, b) => b[1] - a[1])
    : [];
  return (
    <section className="panel">
      <div className="sec-head">
        <h3>{title}</h3>
        <span className="hint">
          {sub} · <b className="num">{hm(left)}</b> of review left
        </span>
      </div>
      {plan.length ? (
        <>
          {byReviewer.length ? (
            <p className="hint" style={{ margin: 0 }}>
              {byReviewer.map(([n, m]) => `${n} ${hm(m)}`).join(" · ")}
            </p>
          ) : null}
          <div className="tplan">
            {plan.map((t) => (
              <Link key={t.contractId} className="tp-row" href={href(t)} title={t.basis}>
                <span className="tp-name">
                  <b>{t.title}</b>
                  <small>
                    {showReviewer ? `${t.reviewer ?? "no reviewer"} · ` : ""}
                    {t.due ? `review by ${formatDate(t.due)}` : "no date"} · {t.basis}
                  </small>
                </span>
                <span className="tp-num num">
                  {t.spent ? `${hm(t.spent)} / ` : ""}
                  {hm(t.est)}
                  <small>{t.done ? "done" : t.over ? `over by ${hm(t.spent - t.est)}` : `${hm(t.left)} left`}</small>
                </span>
                <TimeBar est={t.est} spent={t.spent} max={max} />
              </Link>
            ))}
          </div>
          <Legend
            items={[
              ["Estimated", "var(--rule)"],
              ["Spent", "var(--accent)"],
              ["Over the estimate", "var(--nego)"],
            ]}
          />
        </>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          No first reviews are open.
        </p>
      )}
    </section>
  );
}
