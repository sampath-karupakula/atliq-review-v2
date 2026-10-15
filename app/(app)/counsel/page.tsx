import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs, Kpi, PageHead } from "@/components/ui";
import { CounselAnswerForm, NudgeButton } from "@/components/handoff/Counsel";
import { counselQuestionsList, type CounselRow } from "@/lib/data/handoff";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { appToday, toAppDay } from "@/lib/config";
import { formatDate } from "@/lib/checks/dates";
import { questionStatus, type QuestionState } from "@/lib/review/handoff";

export const metadata: Metadata = { title: "Counsel" };
export const dynamic = "force-dynamic";

type Filter = "open" | "late" | "answered" | "all";
const isoDay = (d: Date | null) => (d ? toAppDay(d) : null);

export default async function CounselPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const [sp, me, all] = await Promise.all([searchParams, getCurrentUser(), counselQuestionsList()]);
  const today = appToday();
  const answering = can(me, "counsel.answer");
  const asking = can(me, "counsel.ask");
  const rows = all.map((q) => ({ q, st: questionStatus({ answerBy: q.answerBy, answeredOn: isoDay(q.answeredAt) }, today) }));
  const open = rows.filter((r) => !r.q.answer);
  const answered = rows.filter((r) => r.q.answer);
  const overdue = open.filter((r) => r.st.key === "overdue").length;
  const soon = open.filter((r) => r.st.key === "soon").length;
  const avg = answered.length ? answered.reduce((a, r) => a + Math.max(0, (r.q.answeredAt!.getTime() - r.q.createdAt.getTime()) / 86_400_000), 0) / answered.length : 0;
  const f: Filter = (["open", "late", "answered", "all"] as const).includes(sp.f as Filter) ? (sp.f as Filter) : "open";
  const shown = rows
    .filter((r) => f === "all" || (f === "open" && !r.q.answer) || (f === "late" && !r.q.answer && (r.st.key === "overdue" || r.st.key === "soon")) || (f === "answered" && r.q.answer))
    .sort((a, b) => a.st.rank - b.st.rank || (a.q.answerBy ?? "9999").localeCompare(b.q.answerBy ?? "9999"));
  const chips: [Filter, string, number][] = [
    ["open", "Waiting", open.length],
    ["late", "Overdue or due soon", overdue + soon],
    ["answered", "Answered", answered.length],
    ["all", "All", rows.length],
  ];

  return (
    <section className="wrap page">
      <Crumbs items={[{ href: "/dashboard", label: "Dashboard" }, { label: answering ? "Questions for you" : "Counsel tracker" }]} />
      <PageHead eyebrow="Outside counsel" title={answering ? "Questions from AtliQ" : "What we've asked counsel"} />
      <div className="kpis">
        <Kpi value={open.length} label="Waiting for an answer" sub={(() => { const n = new Set(open.map((r) => r.q.contractId)).size; return `${n} contract${n === 1 ? "" : "s"}`; })()} />
        <Kpi value={overdue} label="Overdue" sub={overdue ? "Past the answer-by date" : "Nothing late"} alert={overdue > 0} />
        <Kpi value={soon} label="Due in 2 days" sub="Before client deadlines" />
        <Kpi value={answered.length ? `${Math.round(avg * 10) / 10} days` : "—"} label="Average time to answer" sub={`${answered.length} answered`} />
      </div>
      <nav className="chips" aria-label="Filter questions">
        {chips.map(([k, l, n]) => (
          <Link key={k} className="chip" href={`/counsel?f=${k}`} aria-current={f === k ? "true" : undefined}>
            {l}
            <b className="num">{n}</b>
          </Link>
        ))}
      </nav>
      <div className="panel" style={{ padding: "4px 18px" }}>
        {shown.length ? (
          shown.map(({ q, st }) => <Question key={q.id} q={q} st={st} answering={answering} asking={asking} />)
        ) : (
          <p className="hint" style={{ padding: "14px 0" }}>
            {rows.length ? "Nothing in this view." : asking ? "No questions yet. Use “Ask counsel” on a contract to share a pack." : "No questions have been shared with you yet."}
          </p>
        )}
      </div>
      <p className="hint">Questions are shared inside AtliQ Review only. Nudges are reminders in counsel&apos;s notifications; nothing is emailed.</p>
    </section>
  );
}

function Question({ q, st, answering, asking }: { q: CounselRow; st: QuestionState; answering: boolean; asking: boolean }) {
  return (
    <div className="qrow">
      <span className="dismiss-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <span>
          <Link href={`/contracts/${q.contractId}`}>
            <b>{q.contractTitle}</b>
          </Link>
          <span className="hint">
            {" "}
            · asked by {q.askedBy} on {formatDate(isoDay(q.createdAt))}
          </span>
        </span>
        <span className="dismiss-row">
          <span className={`sev ${st.tone}`}>{st.label}</span>
          {q.answerBy && !q.answer ? <span className="hint">Answer by {formatDate(q.answerBy)}</span> : null}
        </span>
      </span>
      <p style={{ margin: 0 }}>{q.question}</p>
      {q.files.length ? <span className="hint">Pack: {q.files.join(" · ")}</span> : null}
      {q.answer ? (
        <p className="answerbox" style={{ margin: 0 }}>
          <b>{q.answeredBy}</b> on {formatDate(isoDay(q.answeredAt))}: {q.answer}
        </p>
      ) : answering ? (
        <CounselAnswerForm questionId={q.id} />
      ) : asking ? (
        <span className="dismiss-row">
          <NudgeButton questionId={q.id} />
          {q.nudgedAt ? <span className="hint">Nudged {formatDate(isoDay(q.nudgedAt))}</span> : null}
        </span>
      ) : null}
    </div>
  );
}
