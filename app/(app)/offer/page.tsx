import type { Metadata } from "next";
import { Crumbs, PageHead, SeverityChip } from "@/components/ui";
import { OfferCheck } from "@/components/offer/OfferCheck";
import { getOfferInputs, recentChecks } from "@/lib/data/offer";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { VERDICT_LABEL, type Verdict } from "@/lib/offer/check";

export const metadata: Metadata = { title: "Can I offer this?" };
export const dynamic = "force-dynamic";

const CHIP: Record<string, "serious" | "negotiable" | "okc"> = { stop: "serious", warn: "negotiable", ok: "okc" };
const when = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export default async function OfferPage() {
  const me = await getCurrentUser();
  const [inputs, checks] = await Promise.all([getOfferInputs(), me ? recentChecks(me.name) : Promise.resolve([])]);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const thisWeek = checks.filter((c) => c.createdAt.getTime() >= weekAgo);
  return (
    <section className="wrap page">
      <Crumbs items={[{ href: "/dashboard", label: "Dashboard" }, { label: "Can I offer this?" }]} />
      <PageHead eyebrow="Before the call" title="Can I offer this?" />
      <OfferCheck promises={inputs.promises} terms={inputs.terms} coverage={inputs.coverage} canRecord={can(me, "offer.record")} />

      <section className="queue">
        <div className="sec-head">
          <h2>Your recent checks</h2>
          <p>
            {thisWeek.length} this week · {thisWeek.filter((c) => c.verdict === "stop").length} would have broken a promise
          </p>
        </div>
        {checks.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>You asked</th>
                  <th>Answer</th>
                  <th>Because of</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.id}>
                    <td>{c.query}</td>
                    <td>
                      <SeverityChip sev={CHIP[c.verdict] ?? "okc"}>{VERDICT_LABEL[c.verdict as Verdict] ?? c.verdict}</SeverityChip>
                      <small className="hint" style={{ display: "block", marginTop: 4 }}>
                        {c.head}
                      </small>
                    </td>
                    <td style={{ color: "var(--ink-2)", maxWidth: 360 }}>{c.source}</td>
                    <td className="num muted">{when(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">Nothing kept yet. Press Enter after a check to keep it here.</p>
        )}
      </section>
      <p className="hint">Took notes on the call? Add them to the deal&apos;s Call notes, so they&apos;re compared with what the draft says.</p>
    </section>
  );
}
