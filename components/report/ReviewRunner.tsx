"use client";

// Starts a review and follows its progress. The review runs on the server in the background (lib/data/driver.ts):
// the browser only polls GET /api/reviews/[id], so closing the tab doesn't stop it, and the owner and the admins get a
// notification when it finishes.
// UX: elapsed time per step and overall, a progress bar and an estimate (heuristic 1, Doherty); Stop and Resume
// (heuristic 3) — finished steps are saved on the server, so resuming repeats no AI call that already succeeded;
// a result card at the end (peak-end rule); plain-language errors with the technical detail folded away (heuristic 9).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleDot, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { friendlyError } from "@/lib/ux/errors";
import { PIPELINE_STEPS, resumePoint, type PipelineStep } from "@/lib/ux/resume";
import { BandPill, btn, SeverityPill, type BandLabel as Band, type PipelineSeverity as Severity } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type StepKey = "reading" | "masking" | PipelineStep;

const STEPS: { key: StepKey; label: string }[] = [
  { key: "reading", label: "Reading the document" },
  { key: "masking", label: "Hiding names and personal details" },
  { key: "extract", label: "Pulling out the key terms" },
  { key: "checks", label: "Checking company, law and usual terms" },
  { key: "clash", label: "Checking against AtliQ's past promises" },
  { key: "scan", label: "Reading every clause" },
  { key: "bundle", label: "Checking the other documents in the deal" },
  { key: "finalize", label: "Verifying quotes and scoring" },
];

export type ReviewResult = { score: number; band: Band; counts: Record<Severity, number>; top: { severity: Severity; title: string }[] };

type State = {
  phase: "idle" | "running" | "done" | "error";
  current: StepKey | null;
  done: Set<StepKey>;
  detail: string;
  fraction: number;
  error: string | null;
  reviewId: string | null;
  canResume: boolean;
  startedAt: number | null;
  stepStartedAt: number | null;
  stepTimes: Partial<Record<StepKey, number>>;
  result: ReviewResult | null;
  /** Masked and waiting for a background slot (BACKGROUND_CONCURRENCY). */
  queued: boolean;
};

const initial: State = { queued: false, phase: "idle", current: null, done: new Set(), detail: "", fraction: 0, error: null, reviewId: null, canResume: false, startedAt: null, stepStartedAt: null, stepTimes: {}, result: null };

type Status = {
  status: "running" | "queued" | "done" | "failed";
  step: string | null;
  error: string | null;
  startedAt: string;
  interrupted: boolean;
  resumable: boolean;
  result: ReviewResult | null;
};

class StepError extends Error {
  constructor(message: string, public reason: string) {
    super(message);
  }
}

async function post(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.failed) throw new StepError(String(json.message ?? json.error ?? `Request failed (${res.status})`), String(json.reason ?? "error"));
  return json;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** A rough range from the size of the document, shown before and during the run. */
export function estimateText(clauses: number): string {
  if (clauses <= 40) return "1–2 minutes";
  if (clauses <= 100) return "2–4 minutes";
  return "4–6 minutes";
}

/** Where a saved step string puts the progress list: finished steps, the current step and its part. */
function progressFrom(step: string | null): { current: StepKey | null; done: Set<StepKey>; detail: string; fraction: number } {
  const s = step ?? "masking";
  if (s === "masking") return { current: "masking", done: new Set(["reading"]), detail: "", fraction: 0 };
  if (s === "done") return { current: null, done: new Set(STEPS.map((x) => x.key)), detail: "", fraction: 0 };
  const next = resumePoint(s);
  if (!next) return { current: null, done: new Set(["reading", "masking"]), detail: "", fraction: 0 };
  const done = new Set<StepKey>(["reading", "masking", ...PIPELINE_STEPS.slice(0, PIPELINE_STEPS.indexOf(next))]);
  const part = s.match(/(\d+)\/(\d+)/);
  return { current: next, done, detail: part ? `part ${+part[1] + 1} of ${part[2]}` : "", fraction: part ? +part[1] / +part[2] : 0 };
}

export function useReviewRunner() {
  const [state, setState] = useState<State>(initial);
  const token = useRef(0);

  useEffect(() => () => void (token.current += 1), []);

  /** Follow a review on the server until it finishes, fails or is stopped. */
  const follow = useCallback(async (reviewId: string) => {
    const mine = ++token.current;
    let lastCurrent: StepKey | null = null;
    let stepStart = Date.now();
    const times: Partial<Record<StepKey, number>> = {};
    for (;;) {
      if (token.current !== mine) return;
      let st: Status;
      try {
        const res = await fetch(`/api/reviews/${reviewId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        st = (await res.json()) as Status;
      } catch {
        await new Promise((r) => setTimeout(r, 4000));
        continue; // a dropped poll is not a failed review
      }
      if (token.current !== mine) return;
      const p = progressFrom(st.status === "done" ? "done" : st.step);
      if (p.current !== lastCurrent) {
        if (lastCurrent) times[lastCurrent] = Date.now() - stepStart;
        lastCurrent = p.current;
        stepStart = Date.now();
      }
      const startedAt = new Date(st.startedAt).getTime();
      if (st.status === "done") {
        setState((s) => ({ ...s, ...p, phase: "done", queued: false, reviewId, startedAt, error: null, result: st.result, stepTimes: { ...s.stepTimes, ...times } }));
        return;
      }
      if (st.status === "failed" || st.interrupted) {
        setState((s) => ({
          ...s,
          ...p,
          current: null,
          phase: "error",
          reviewId,
          startedAt,
          error: st.interrupted ? "The review was interrupted (the server lost track of it)." : (st.error ?? "The review stopped."),
          canResume: st.resumable,
          stepTimes: { ...s.stepTimes, ...times },
        }));
        return;
      }
      if (st.status === "queued") {
        setState((s) => ({ ...s, current: null, done: new Set(["reading", "masking"]), phase: "running", queued: true, reviewId, startedAt, error: null }));
      } else {
        setState((s) => ({ ...s, ...p, phase: "running", queued: false, reviewId, startedAt, stepStartedAt: stepStart, error: null, stepTimes: { ...s.stepTimes, ...times } }));
      }
      await new Promise((r) => setTimeout(r, document.visibilityState === "visible" ? 2000 : 8000));
    }
  }, []);

  const fail = useCallback((err: unknown, reviewId: string | null) => {
    const message = err instanceof Error ? err.message : String(err);
    const reason = err instanceof StepError ? err.reason : "error";
    setState((s) => ({ ...s, phase: "error", current: null, error: message, reviewId: reviewId ?? s.reviewId, canResume: !!(reviewId ?? s.reviewId) && reason !== "masking_leak" && reason !== "busy" && reason !== "budget" }));
  }, []);

  const run = useCallback(
    async (contractId: string) => {
      const startedAt = Date.now();
      setState({ ...initial, phase: "running", current: "masking", done: new Set(["reading"]), startedAt, stepStartedAt: startedAt });
      try {
        const created = await post("/api/reviews", { contractId });
        await follow(String(created.reviewId));
      } catch (err) {
        fail(err, null);
      }
    },
    [follow, fail],
  );

  const resume = useCallback(
    async (reviewId: string) => {
      setState((s) => ({ ...s, phase: "running", error: null, reviewId }));
      try {
        await post(`/api/reviews/${reviewId}/resume`);
        await follow(reviewId);
      } catch (err) {
        fail(err, reviewId);
      }
    },
    [follow, fail],
  );

  /** Start following a review that is already running (e.g. started in another tab). */
  const attach = useCallback((reviewId: string) => void follow(reviewId), [follow]);

  const cancel = useCallback(async () => {
    token.current += 1; // stop polling
    const id = state.reviewId;
    if (id) await fetch(`/api/reviews/${id}/cancel`, { method: "POST" }).catch(() => {});
    setState((s) => ({ ...s, phase: "error", current: null, error: "Cancelled by the user.", canResume: true }));
  }, [state.reviewId]);

  return { state, run, resume, attach, cancel };
}


function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function ReviewProgress({ state, clauses }: { state: State; clauses?: number }) {
  const now = useNow(state.phase === "running");
  const total = STEPS.length;
  const pct = Math.round(((state.done.size + (state.current ? state.fraction : 0)) / total) * 100);
  return (
    <div className="space-y-3">
      {(state.phase === "running" || state.phase === "done") && (
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs text-muted">
            <span>
              {state.phase === "done" ? "Finished" : `${pct}% · usually takes ${clauses != null ? estimateText(clauses) : "a few minutes"}`}
            </span>
            {state.startedAt && <span className="tabular-nums">{state.phase === "done" ? "" : `Elapsed ${mmss(now - state.startedAt)}`}</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Review progress">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${state.phase === "done" ? 100 : pct}%` }} />
          </div>
        </div>
      )}
      {state.queued && (
        <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">
          Queued: names are already hidden, and the review starts as soon as one of the reviews ahead of it finishes.
        </p>
      )}
      <ol className="space-y-1.5 text-sm">
        {STEPS.map((s) => {
          const isDone = state.done.has(s.key);
          const isCurrent = state.current === s.key && state.phase === "running";
          const took = state.stepTimes[s.key];
          return (
            <li key={s.key} className={`flex items-center gap-2 ${isDone ? "text-fg" : isCurrent ? "font-medium text-accent" : "text-muted"}`} aria-current={isCurrent ? "step" : undefined}>
              <span aria-hidden className="inline-flex w-4 justify-center">
                {isDone ? <Check className="size-4 text-ok" /> : isCurrent ? <Loader2 className="size-4 animate-spin" /> : <CircleDot className="size-3 opacity-40" />}
              </span>
              <span className="flex-1">
                {s.label}
                {isCurrent && state.detail && <span className="font-normal text-muted"> ({state.detail})</span>}
              </span>
              <span className="text-xs tabular-nums text-muted">
                {isCurrent && state.stepStartedAt ? mmss(now - state.stepStartedAt) : isDone && took != null && took > 1500 ? mmss(took) : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {state.phase === "running" && state.current ? STEPS.find((s) => s.key === state.current)?.label : state.phase === "done" ? "Review finished." : ""}
      </p>
      {state.error && <ErrorBox raw={state.error} />}
    </div>
  );
}

export function ErrorBox({ raw }: { raw: string }) {
  const e = friendlyError(raw);
  return (
    <div className={`rounded-md p-3 text-sm ${e.kind === "cancelled" ? "bg-surface-2" : "bg-serious-bg text-serious"}`} role="alert">
      <p className="font-medium">{e.title}</p>
      <p className={e.kind === "cancelled" ? "mt-1 text-muted" : "mt-1"}>{e.next}</p>
      {e.kind !== "cancelled" && (
        <details className="mt-2 text-xs opacity-80">
          <summary className="cursor-pointer">Technical details</summary>
          <p className="mt-1 break-words font-mono">{e.raw}</p>
        </details>
      )}
    </div>
  );
}

/** The outcome at the end of a run: band, score and the top issues (peak-end rule). */
export function ResultCard({ result, contractId }: { result: ReviewResult; contractId: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/60 p-4">
      <div className="flex items-center gap-3">
        <span className="text-4xl font-semibold tabular-nums leading-none">{result.score}</span>
        <div>
          <BandPill band={result.band} />
          <p className="mt-1 text-xs text-muted">
            {result.counts.serious} Serious · {result.counts.negotiable} Negotiable · {result.counts.minor} Minor · {result.counts.not_sure} Not sure
          </p>
        </div>
      </div>
      {result.top.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {result.top.map((t, i) => (
            <li key={i} className="flex items-start gap-2">
              <SeverityPill severity={t.severity} />
              <span>{t.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ok">Nothing Serious or Negotiable found.</p>
      )}
      <Link href={`/contracts/${contractId}`} className={`${btn("primary")} mt-4`}>
        Open the full report
      </Link>
    </div>
  );
}

/** Controls for a running/stopped review: Cancel while running; Resume / Start over when stopped. */
export function RunnerControls({
  state,
  onCancel,
  onResume,
  onRestart,
}: {
  state: State;
  onCancel: () => void;
  onResume?: () => void;
  onRestart?: () => void;
}) {
  if (state.phase === "running")
    return (
      <button type="button" onClick={onCancel} className={btn("secondary", "sm")}>
        <Pause className="size-4" aria-hidden /> Stop the review
      </button>
    );
  if (state.phase !== "error") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {state.canResume && onResume && (
        <button type="button" onClick={onResume} className={btn("primary", "sm")}>
          <Play className="size-4" aria-hidden /> Resume from where it stopped
        </button>
      )}
      {onRestart && (
        <button type="button" onClick={onRestart} className={btn(state.canResume ? "secondary" : "primary", "sm")}>
          <RotateCcw className="size-4" aria-hidden /> Start over
        </button>
      )}
    </div>
  );
}

/** Button + progress used on a contract page that has no finished review yet. */
export function RunReviewPanel({
  contractId,
  clauses,
  last,
  runningId,
  daysUntilDue = null,
  horizonDays = 14,
}: {
  contractId: string;
  clauses: number;
  /** Days until the review-by date or client deadline; a review started long before it asks for confirmation. */
  daysUntilDue?: number | null;
  horizonDays?: number;
  /** The latest attempt, if it stopped (failed, cancelled or interrupted) and can be resumed from a saved step. */
  last: { reviewId: string; error: string | null; resumable: boolean } | null;
  /** A review of this contract already running on the server (started here earlier or in another tab). */
  runningId?: string | null;
}) {
  const router = useRouter();
  const { state, run, resume, attach, cancel } = useReviewRunner();
  const notDueSoon = daysUntilDue != null && daysUntilDue > horizonDays;
  const [confirm, setConfirm] = useState(false);
  const started = state.phase !== "idle";
  useEffect(() => {
    if (runningId) attach(runningId);
  }, [runningId, attach]);
  useEffect(() => {
    if (state.phase === "done") router.refresh();
  }, [state.phase, router]);

  const start = () => {
    setConfirm(false);
    void run(contractId);
  };
  const stoppedLast = !started && last;
  const lastResumable = !!last?.resumable;

  return (
    <div className="space-y-4">
      {stoppedLast && last.error && <ErrorBox raw={last.error} />}
      {!started && (
        <div className="flex flex-wrap gap-2">
          {lastResumable && (
            <button type="button" onClick={() => void resume(last!.reviewId)} className={btn("primary")}>
              <Play className="size-4" aria-hidden /> Resume from where it stopped
            </button>
          )}
          <button type="button" onClick={() => (last || notDueSoon ? setConfirm(true) : start())} className={btn(lastResumable ? "secondary" : "primary")}>
            {last ? (
              <>
                <RotateCcw className="size-4" aria-hidden /> Start a new review
              </>
            ) : (
              "Run review"
            )}
          </button>
        </div>
      )}
      {started && <ReviewProgress state={state} clauses={clauses} />}
      <RunnerControls
        state={state}
        onCancel={() => void cancel()}
        onResume={state.reviewId ? () => void resume(state.reviewId!) : undefined}
        onRestart={() => setConfirm(true)}
      />
      {state.phase === "done" && state.result && <ResultCard result={state.result} contractId={contractId} />}
      <p className="text-xs text-muted">
        {state.phase === "running"
          ? "You can leave this page: the review keeps running on the server, and the owner and the admins get a notification when it's done."
          : `Names and personal details are hidden before anything is sent to the AI. A review usually takes ${estimateText(clauses)} and keeps running if you leave the page.`}
      </p>
      <ConfirmDialog open={confirm} title={last ? "Start a new review?" : "Start the AI review now?"} confirmLabel={last ? "Start new review" : "Start review"} onConfirm={start} onCancel={() => setConfirm(false)}>
        <p>This {last ? "runs every step again" : "uses"} paid AI calls and usually takes {estimateText(clauses)}.</p>
        {notDueSoon && <p className="font-medium text-negotiable">It isn&rsquo;t due for {daysUntilDue} days. You could wait and review it closer to the date.</p>}
        {lastResumable && <p>To reuse the steps that already finished, choose &ldquo;Resume&rdquo; instead.</p>}
      </ConfirmDialog>
    </div>
  );
}
