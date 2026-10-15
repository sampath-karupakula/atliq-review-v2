// The hand-off cards on a contract's rail (server-rendered): first review, second reviewer, counsel questions,
// review time and the printable brief. Each card shows only what the viewer can act on or needs to know.
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assignments } from "@/lib/db/schema";
import { appToday, toAppDay } from "@/lib/config";
import { formatDate } from "@/lib/checks/dates";
import { can } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session";
import { counselPackFiles, counselQuestionsList, marksFor, openSecondReview, reviewTimes } from "@/lib/data/handoff";
import { currentAssignment } from "@/lib/data/assignments";
import { listPeople } from "@/lib/data/people";
import { defaultReviewBy, hm, questionStatus } from "@/lib/review/handoff";
import { AssignButton } from "./AssignDialog";
import { CounselPackButton, NotThisTimeButton } from "./Counsel";
import { TimeBar } from "./TimeBar";

export async function HandoffCards({ contract, me, dealOwner, clientDeadline, band, decided, reviewed }: { contract: { id: string; title: string }; me: CurrentUser; dealOwner: string | null; clientDeadline: string | null; band: string | null; decided: boolean; reviewed: boolean }) {
  const today = appToday();
  const db = getDb();
  const [assignment, [lastFirst], second, questions, [time], marks, people, openRows, files] = await Promise.all([
    currentAssignment(contract.id),
    db.select().from(assignments).where(eq(assignments.contractId, contract.id)).orderBy(desc(assignments.createdAt)).limit(1),
    openSecondReview(contract.id),
    counselQuestionsList({ contractId: contract.id }),
    reviewTimes([contract.id]),
    marksFor(contract.id),
    listPeople({ roles: ["admin", "reviewer"] }),
    db.select({ reviewer: assignments.reviewer }).from(assignments).where(eq(assignments.status, "assigned")),
    counselPackFiles(contract.id),
  ]);
  const admin = can(me, "review.assign");
  const peopleOpen = people.map((p) => ({ name: p.name, open: openRows.filter((r) => r.reviewer === p.name).length }));
  const assignProps = { contractId: contract.id, title: contract.title, clientDeadline, owner: dealOwner, today, defaultDate: defaultReviewBy(clientDeadline, today), people: peopleOpen };
  const iMark = (assignment && assignment.reviewer === me.name) || (second?.status === "assigned" && second.reviewer === me.name);
  const firstMarks = lastFirst ? marks.filter((m) => m.reviewer === lastFirst.reviewer) : [];
  const count = (k: string) => firstMarks.filter((m) => m.mark === k).length;
  const showSecond = admin && dealOwner === me.name && band === "High" && !decided;

  return (
    <>
      <div className="score-card">
        <h3>First review</h3>
        {assignment ? (
          <p style={{ fontSize: 14, margin: 0 }}>
            <b>{assignment.reviewer}</b> reviews it by <b>{formatDate(assignment.reviewDeadline)}</b>.
            {assignment.concerns ? <span className="ask" style={{ display: "block", marginTop: 8 }}>{assignment.concerns}</span> : null}
          </p>
        ) : lastFirst?.status === "done" ? (
          <p style={{ fontSize: 14, margin: 0 }}>
            Done by <b>{lastFirst.reviewer}</b>
            {lastFirst.completedAt ? ` on ${formatDate(toAppDay(lastFirst.completedAt))}` : ""}
            {firstMarks.length ? ` · ${count("agree")} to push back on, ${count("disagree")} disagreed, ${count("question")} question${count("question") === 1 ? "" : "s"}` : ""}.
          </p>
        ) : (
          <p className="hint" style={{ margin: 0 }}>
            Nobody is assigned yet.
          </p>
        )}
        <span className="dismiss-row">
          {iMark && reviewed ? (
            <Link className="btn small primary" href={`/mark/${contract.id}`}>
              Mark each finding
            </Link>
          ) : null}
          {!iMark && reviewed && (lastFirst || admin) ? (
            <Link className="btn small quiet" href={`/mark/${contract.id}`}>
              See the marks
            </Link>
          ) : null}
          {admin && !decided ? <AssignButton {...assignProps} label={assignment ? "Reassign" : lastFirst ? "Ask for another review" : "Assign first review"} primary={!assignment && !lastFirst} /> : null}
        </span>
        {iMark && !reviewed ? <p className="hint" style={{ margin: 0 }}>Start the AI review first; then mark each finding.</p> : null}
      </div>

      {showSecond && !second ? (
        <div className="score-card second">
          <h3>Second review suggested</h3>
          <p style={{ fontSize: 14, margin: 0 }}>You own this deal and it&apos;s High risk. A second reviewer catches what an owner is too close to see.</p>
          <span className="dismiss-row">
            <AssignButton {...assignProps} mode="second" exclude={lastFirst?.reviewer ?? null} primary />
            <NotThisTimeButton contractId={contract.id} />
          </span>
        </div>
      ) : second && second.status !== "declined" ? (
        <div className="score-card">
          <h3>Second review</h3>
          <p style={{ fontSize: 14, margin: 0 }}>
            <b>{second.reviewer}</b> {second.status === "done" ? "finished the second review" : `is reviewing too${second.reviewDeadline ? `, by ${formatDate(second.reviewDeadline)}` : ""}`}.
          </p>
        </div>
      ) : null}

      {questions.length || admin ? (
        <div className="score-card">
          <h3>Counsel</h3>
          {questions.length ? (
            <ul className="mini-list">
              {questions.map((q) => {
                const st = questionStatus({ answerBy: q.answerBy, answeredOn: q.answeredAt ? toAppDay(q.answeredAt) : null }, today);
                return (
                  <li key={q.id} style={{ display: "block" }}>
                    <span style={{ display: "block", fontSize: 13.5 }}>{q.question}</span>
                    <span className={`sev ${st.tone}`} style={{ marginTop: 4 }}>
                      {st.key === "waiting" && q.answerBy ? `Due ${formatDate(q.answerBy)}` : st.label}
                    </span>
                    {q.answer ? (
                      <p className="answerbox" style={{ margin: "6px 0 0" }}>
                        <b>{q.answeredBy}:</b> {q.answer}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="hint" style={{ margin: 0 }}>
              No questions for counsel yet.
            </p>
          )}
          <span className="dismiss-row">
            {can(me, "counsel.ask") ? <CounselPackButton contractId={contract.id} title={contract.title} files={files} clientDeadline={clientDeadline} defaultAnswerBy={clientDeadline ? defaultReviewBy(clientDeadline, today) : defaultReviewBy(null, today)} /> : null}
            {questions.length ? (
              <Link className="btn small quiet" href="/counsel">
                Counsel tracker
              </Link>
            ) : null}
          </span>
        </div>
      ) : null}

      {time && reviewed ? (
        <div className="score-card">
          <h3>Review time</h3>
          <div className="tgrid">
            <div>
              <span className="hint">Estimated</span>
              <b className="num">{hm(time.est)}</b>
            </div>
            <div>
              <span className="hint">Spent</span>
              <b className={`num${time.over ? " overt" : ""}`}>{hm(time.spent)}</b>
            </div>
            <div>
              <span className="hint">{time.done ? "Status" : "Left"}</span>
              <b className="num">{time.done ? "Done" : hm(time.left)}</b>
            </div>
          </div>
          <TimeBar est={time.est} spent={time.spent} max={Math.max(time.est, time.spent)} />
          <p className="hint" style={{ margin: 0 }}>
            {time.basis}. Spent is the time the marking screen was open and in front.
          </p>
        </div>
      ) : null}

      {reviewed ? (
        <Link className="btn small quiet" href={`/contracts/${contract.id}/brief`} style={{ alignSelf: "flex-start" }}>
          Printable brief
        </Link>
      ) : null}
    </>
  );
}
