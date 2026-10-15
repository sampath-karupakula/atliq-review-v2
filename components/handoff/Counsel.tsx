"use client";

// Counsel pack (feature 27): Karandeep chooses files and writes questions with an answer-by date; counsel answers in
// AtliQ Review. Sharing makes the questions visible to counsel's account. Nothing is emailed.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { answerCounselQuestion, declineSecondReview, nudgeCounsel, shareCounselPack } from "@/app/actions/handoff";
import { formatDate } from "@/lib/checks/dates";

export function CounselPackButton({ contractId, title, files, defaultAnswerBy, clientDeadline }: { contractId: string; title: string; files: { key: string; label: string }[]; defaultAnswerBy: string; clientDeadline: string | null }) {
  const all = [{ key: "report", label: `Review report: ${title}` }, { key: "brief", label: "Printable brief: summary, Serious items with quotes" }, ...files];
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>(["report", "brief"]);
  const [questions, setQuestions] = useState("");
  const [by, setBy] = useState(defaultAnswerBy);
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const lines = questions.split("\n").map((q) => q.trim()).filter(Boolean);
  return (
    <>
      <button type="button" className="btn small" onClick={() => setOpen(true)}>
        Ask counsel
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label={`Counsel pack · ${title}`} wide>
        <h2 style={{ margin: 0 }}>Counsel pack · {title}</h2>
        <form
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await shareCounselPack({ contractId, files: all.filter((f) => chosen.includes(f.key)).map((f) => f.label), questions: lines, answerBy: by });
              if (!r.ok) return toast(r.error, { tone: "error" });
              setOpen(false);
              setQuestions("");
              router.refresh();
              toast(`Shared ${lines.length} question${lines.length === 1 ? "" : "s"} with counsel. The tracker chases the answer-by date.`);
            });
          }}
        >
          <div className="radio-list">
            {all.map((f) => (
              <label key={f.key}>
                <span>
                  <input type="checkbox" checked={chosen.includes(f.key)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, f.key] : c.filter((x) => x !== f.key)))} /> {f.label}
                </span>
              </label>
            ))}
          </div>
          <div className="row">
            <label htmlFor="cpQ">Questions for counsel · one per line</label>
            <textarea id="cpQ" style={{ minHeight: 96 }} value={questions} onChange={(e) => setQuestions(e.target.value)} placeholder="Does the Seaside waiver language in Al Noor Clause 12 extend to Gulf Crown if Al Noor agrees by email?" />
          </div>
          <div className="row">
            <label htmlFor="cpBy">Answer needed by</label>
            <input type="date" id="cpBy" value={by} onChange={(e) => setBy(e.target.value)} />
            <span className="hint">{clientDeadline ? `A day before the client deadline (${formatDate(clientDeadline)}). ` : ""}Counsel sees this date and the tracker chases it.</span>
          </div>
          <p className="warnline" style={{ margin: 0 }}>
            Contains client names, unmasked, because counsel needs them. Shared only with counsel&apos;s account in AtliQ Review.
          </p>
          <div className="btns">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy || !lines.length}>
              Share with counsel
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function CounselAnswerForm({ questionId }: { questionId: string }) {
  const [text, setText] = useState("");
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await answerCounselQuestion(questionId, text);
          if (!r.ok) return toast(r.error, { tone: "error" });
          setText("");
          router.refresh();
          toast("Answer shared with Karandeep. It shows on the report.");
        });
      }}
    >
      <textarea aria-label="Your answer" value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer" style={{ minHeight: 70 }} />
      <div>
        <button type="submit" className="btn small primary" disabled={busy || text.trim().length < 10}>
          Send answer
        </button>
      </div>
    </form>
  );
}

export function NudgeButton({ questionId }: { questionId: string }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      type="button"
      className="btn small quiet"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await nudgeCounsel(questionId);
          if (!r.ok) return toast(r.error, { tone: "error" });
          router.refresh();
          toast("Reminder sent to counsel in AtliQ Review.");
        })
      }
    >
      Nudge
    </button>
  );
}

export function NotThisTimeButton({ contractId }: { contractId: string }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <button
      type="button"
      className="btn quiet small"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await declineSecondReview(contractId);
          if (!r.ok) return toast(r.error, { tone: "error" });
          router.refresh();
          toast("No second reviewer this time.");
        })
      }
    >
      Not this time
    </button>
  );
}
