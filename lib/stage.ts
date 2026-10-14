// Where a contract is in its life, worked out from what has happened (uploads, reviews, first review, conditions,
// pushback sent, decision). Nobody moves a stage by hand, so it can never be out of date. Pure and tested.
//
//   Received → AI review → First review → Negotiating → Ready for decision → Decided
//
// Negotiating appears only when there is something to push back on; otherwise it is skipped.

export const STAGES = ["Received", "AI review", "First review", "Negotiating", "Ready for decision", "Decided"] as const;
export type StageKey = "received" | "ai" | "review" | "negotiating" | "ready" | "decided";

export type StageFacts = {
  /** Latest review of this version. */
  review: "none" | "queued" | "running" | "done" | "failed";
  /** First review: none assigned, assigned and open, or marked done. */
  firstReview: "none" | "open" | "done";
  reviewer: string | null;
  /** Karandeep's open conditions on this version. */
  openConditions: number;
  /** Pushback items not yet settled: open Serious and Negotiable findings, plus open conditions. */
  pushbackItems: number;
  /** A pushback was sent for this version and the revised version hasn't arrived. */
  pushbackSent: boolean;
  /** Contract version = negotiation round. */
  round: number;
  /** Whether any earlier round went through negotiation. */
  negotiatedBefore: boolean;
  decision: "sign_intended" | "reject" | null;
  counterparty: string;
};

export type Stage = { key: StageKey; index: number; label: string; next: string; negotiationSkipped: boolean };

export function stageOf(f: StageFacts): Stage {
  const roundNote = f.round > 1 ? ` · round ${f.round}` : "";
  if (f.decision) {
    return {
      key: "decided",
      index: 5,
      label: f.decision === "reject" ? "Decided: rejected" : "Decided: intend to sign",
      next: "Recorded. Nothing was signed or sent by the tool.",
      negotiationSkipped: !f.negotiatedBefore && f.openConditions === 0 && !f.pushbackSent,
    };
  }
  if (f.review === "queued" || f.review === "running") {
    return { key: "ai", index: 1, label: `AI reviewing v${f.round}`, next: "The AI is reading every clause. The stage moves on by itself when it finishes.", negotiationSkipped: false };
  }
  if (f.review !== "done") {
    return {
      key: "received",
      index: 0,
      label: f.review === "failed" ? "Received · the last review stopped" : "Received · not reviewed yet",
      next: f.review === "failed" ? "Resume the review or start a new one." : "Start the AI review when it's due.",
      negotiationSkipped: false,
    };
  }
  if (f.firstReview === "open") {
    return {
      key: "review",
      index: 2,
      label: f.round > 1 ? `Re-review of v${f.round}` : "First review",
      next: `${f.reviewer ?? "The reviewer"} reads the findings and marks the review done.`,
      negotiationSkipped: false,
    };
  }
  if (f.openConditions > 0 || f.pushbackSent) {
    return {
      key: "negotiating",
      index: 3,
      label: `Negotiating${roundNote} · ${f.pushbackSent ? `waiting for ${f.counterparty}` : "preparing pushback"}`,
      next: f.pushbackSent ? `Waiting for ${f.counterparty}'s revised version. Uploading it starts round ${f.round + 1}.` : "Copy the pushback email, send it from your own email, then mark it sent.",
      negotiationSkipped: false,
    };
  }
  return {
    key: "ready",
    index: 4,
    label: "Ready for decision",
    next: "Karandeep decides. Serious items must be settled before Intend to sign unlocks.",
    negotiationSkipped: !f.negotiatedBefore,
  };
}

/** The pushback email the user copies and sends from their own mailbox. */
export function pushbackEmail(args: { counterparty: string; conditions: string[]; items: { label: string; ask: string }[]; from: string }): string {
  const lines = [...args.conditions, ...args.items.map((i) => `${i.label}: ${i.ask}`)];
  return [
    `Dear ${args.counterparty} team,`,
    "",
    "Thank you for the draft agreement. Before we can sign, we'd ask for these changes:",
    "",
    ...lines.map((l, i) => `${i + 1}. ${l}`),
    "",
    "Kind regards,",
    args.from,
  ].join("\n");
}
