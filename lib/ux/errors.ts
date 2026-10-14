// Turns technical failure messages (provider errors, leak-check reports, network errors) into plain language with a
// next step (heuristic 9). The raw message is kept for a "Details" disclosure; it never contains contract text.

export type FriendlyError = { title: string; next: string; raw: string; kind: "leak" | "rate" | "daily" | "network" | "format" | "key" | "size" | "refusal" | "cancelled" | "busy" | "other" };

export function friendlyError(raw: string | null | undefined): FriendlyError {
  const msg = (raw ?? "").trim() || "Unknown error.";
  const m = msg.toLowerCase();
  const out = (kind: FriendlyError["kind"], title: string, next: string): FriendlyError => ({ kind, title, next, raw: msg });
  if (m.includes("cancelled")) return out("cancelled", "You stopped this review.", "Nothing was lost — resume it to carry on from the last finished step.");
  if (m.includes("already running")) return out("busy", "A review of this contract is already running.", "Wait for it to finish, or open the contract page to follow it.");
  if (m.includes("masking leak"))
    return out(
      "leak",
      "We stopped before sending anything: a name or personal detail in this contract couldn't be hidden safely.",
      "Nothing reached the AI. Try again; if it happens again, add the name to the register (e.g. a new client) or review this contract manually.",
    );
  if (m.includes("review budget")) return out("daily", "Today's review allowance for this demo is used up.", "Finished reports are still available. New reviews start again tomorrow.");
  if (m.includes("too many")) return out("rate", "Too many requests from this connection.", "Wait a few minutes, then resume the review — finished steps are kept.");
  if (m.includes("daily limit")) return out("daily", "The AI service's daily allowance is used up.", "Nothing was saved as a report. Resume the review tomorrow, or switch to the Anthropic key.");
  if (m.includes("rate-limit") || m.includes("rate limit") || m.includes("429"))
    return out("rate", "The AI service is busy right now.", "Nothing was lost. Wait a minute, then resume the review — finished steps are kept.");
  if (m.includes("fetch failed") || m.includes("network") || m.includes("could not reach") || m.includes("econn") || m.includes("connection error") || m.includes("timed out") || m.includes("timeout"))
    return out("network", "The connection to the AI service dropped.", "Check the internet connection, then resume the review — finished steps are kept.");
  if (m.includes("key was rejected") || m.includes("no api key") || m.includes("api key"))
    return out("key", "The AI service rejected AtliQ Review's key.", "An administrator needs to check the API key setting. No contract text was sent.");
  if (m.includes("too large") || m.includes("too long"))
    return out("size", "This document is too long to review in one go.", "Split it (e.g. the MSA and its schedules) and upload the parts, or review it manually.");
  if (m.includes("declined")) return out("refusal", "The AI declined to read this document.", "Review this contract manually.");
  if (m.includes("did not match") || m.includes("cut off") || m.includes("format") || m.includes("schema"))
    return out("format", "The AI's answer was incomplete twice, so no report was produced.", "Resume the review to retry that step, or review this contract manually.");
  return out("other", "The review stopped because of an unexpected error.", "Resume the review to retry, or review this contract manually. If it keeps failing, open Technical details and pass them on.");
}
