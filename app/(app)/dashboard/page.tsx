import type { Metadata } from "next";
import { Kpi, PageHead, Panel, SeverityChip, Stub, Tag } from "@/components/ui";
import { Fold } from "@/components/Fold";
import { ROLES } from "@/lib/roles";
import { currentRole } from "@/lib/viewer";
import { appToday } from "@/lib/config";

export const metadata: Metadata = { title: "Dashboard" };

const headline: Record<string, string> = {
  ceo: "Three things need you before the next deadline.",
  reviewer: "Reviews to finish and deals you own.",
  counsel: "Questions waiting for your advice.",
};

export default async function Dashboard() {
  const role = await currentRole();
  const r = ROLES[role];
  const today = new Date(appToday() + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="wrap page">
      <PageHead eyebrow={`${today} · viewing as ${r.name}, ${r.title}`} title={headline[role] ?? "Dashboard"} />
      <div className="kpis">
        <Kpi value="—" label="Open contracts" sub="Counts arrive with the data layer (P2)" href="/contracts" />
        <Kpi value="—" label="Due in 7 days" href="/contracts?filter=week" />
        <Kpi value="—" label="Serious items open" href="/contracts?filter=serious" />
        <Kpi value="—" label="Live clashes" href="/contracts?filter=clash" />
      </div>
      <Stub title={`${r.name}'s dashboard`} phase="P7 (cards, charts and the review-time plan)">
        <p className="muted" style={{ fontSize: 14 }}>
          The shell below shows the shared pieces every screen is built from, in both themes.
        </p>
      </Stub>
      <Panel title="Design primitives" aside={<span className="hint">P1 check</span>}>
        <div className="dismiss-row">
          <SeverityChip sev="serious" />
          <SeverityChip sev="negotiable" />
          <SeverityChip sev="minor" />
          <SeverityChip sev="unsure" />
          <SeverityChip sev="neutral">Not reviewed</SeverityChip>
          <Tag kind="clash">Clash</Tag>
          <Tag kind="fast">Fast track</Tag>
          <Tag kind="new">New in v2</Tag>
          <Tag kind="overdue">Overdue</Tag>
        </div>
        <div className="dismiss-row">
          <button type="button" className="btn primary">
            Primary
          </button>
          <button type="button" className="btn">
            Default
          </button>
          <button type="button" className="btn quiet">
            Quiet
          </button>
          <button type="button" className="btn small">
            Small
          </button>
          <button type="button" className="btn" disabled>
            Disabled
          </button>
        </div>
        <div className="meter goal">
          <i style={{ width: "40%" }} />
        </div>
        <p className="quote">Supplier&apos;s liability for any breach of this Agreement shall not be limited.</p>
      </Panel>
      <Fold
        summary={
          <>
            <SeverityChip sev="minor" /> <span className="num">2</span> items: notices by courier only, Arabic version prevails
          </>
        }
      >
        <div className="fold-row">
          <span className="hint">Clause 17 · Notices</span>
          <span className="grow">Notices by courier only</span>
        </div>
        <div className="fold-row">
          <span className="hint">Clause 19.3 · Language</span>
          <span className="grow">Arabic version prevails</span>
        </div>
      </Fold>
    </section>
  );
}
