import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumbs } from "@/components/ui";
import { MarkingBoard } from "@/components/handoff/MarkingBoard";
import { StageTracker } from "@/components/report/StageTracker";
import { getMarking, reviewerRole } from "@/lib/data/handoff";
import { getContractStage } from "@/lib/data/stage";
import { getCurrentUser } from "@/lib/auth/session";
import { markList } from "@/lib/review/handoff";
import { displayTitle, docLabel } from "@/lib/display";
import { formatDate } from "@/lib/checks/dates";

export const metadata: Metadata = { title: "Mark each finding" };
export const dynamic = "force-dynamic";

export default async function MarkPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ who?: string }> }) {
  const [{ id }, sp, me] = await Promise.all([params, searchParams, getCurrentUser()]);
  const role = await reviewerRole(id, me.name);
  // The assignee marks; anyone else sees the marks of the reviewer named in ?who= (or the last first reviewer).
  const page = await getMarking(id, me.name);
  if (!page) notFound();
  const viewing = role ? me.name : (sp.who ?? page.lastFirst?.reviewer ?? me.name);
  const data = viewing === me.name ? page : await getMarking(id, viewing);
  if (!data) notFound();
  const { contract, review } = data;
  const t = displayTitle(contract);
  const list = markList(data.findings);
  const st = await getContractStage(id);
  // Only the open assignee marks; everyone else (Karandeep included) reads the marks.
  const mine = !!role;
  const done = !mine && ((data.lastFirst?.status === "done" && data.lastFirst.reviewer === viewing) || (data.second?.status === "done" && data.second.reviewer === viewing));
  const round = contract.version;

  return (
    <section className="wrap page">
      <Crumbs items={[{ href: "/dashboard", label: "Dashboard" }, { href: `/contracts/${id}`, label: `${t.primary} · ${docLabel(contract.docType)} v${round}` }, { label: role ? "Mark" : "Marks" }]} />
      <div className="sec-head">
        <div>
          <p className="eyebrow">
            {role?.kind === "second" ? "Second review" : round > 1 ? `Re-review · round ${round}` : "First review"}
            {role?.deadline ? ` · due ${formatDate(role.deadline)}` : ""}
          </p>
          <h1 className="display">{mine ? (round > 2 ? "Check what changed" : "Mark each finding") : `${viewing}'s marks`}</h1>
        </div>
        <Link className="btn quiet" href={`/contracts/${id}`}>
          Open full report
        </Link>
      </div>
      {st ? <StageTracker stage={st.stage} round={round} /> : null}
      {role?.concerns ? (
        <p className="ask">
          <b>{role.assignedBy} asks:</b> {role.concerns}
        </p>
      ) : null}
      {!review ? (
        <div className="stub">
          <p>The AI review hasn&apos;t finished yet, so there is nothing to mark. Start it from the contract page.</p>
        </div>
      ) : (
        <MarkingBoard
          contractId={id}
          items={list}
          initialMarks={data.marks.map((m) => ({ findingId: m.findingId, mark: m.mark, note: m.note }))}
          conditions={role ? data.conditions.map((c) => ({ id: c.id, text: c.text, addressed: c.addressed })) : []}
          done={done}
          readOnly={!mine}
          round={round}
        />
      )}
      <div className="cant">
        <b>What a reviewer can&apos;t do</b>
        <ul>
          <li>Accept a Serious risk or record the decision</li>
          <li>Add or change promises in the register</li>
          <li>Send anything to the client. AtliQ Review never sends; you send pushback yourself.</li>
        </ul>
      </div>
    </section>
  );
}
