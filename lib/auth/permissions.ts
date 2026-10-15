// Role-based access control. Pure, so the whole matrix is unit-tested; every server action and API route checks it
// (the UI only hides what the server would refuse anyway).
//
//   admin    — the founder: everything, including Serious items, decisions, the register, users and demo reset.
//   reviewer — uploads, runs the AI review on contracts assigned to them (or unassigned ones, which they can
//              take), comments, dismisses non-serious items, edits deals they own, marks their reviews done.
//   viewer   — read-only (e.g. external counsel): reports, exports, register, activity.

export const ROLES = ["admin", "reviewer", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin (founder)", reviewer: "Reviewer", viewer: "Viewer (read-only)" };
export const ROLE_HELP: Record<Role, string> = {
  admin: "Everything: decides, dismisses or accepts Serious items, assigns reviews, edits the register, manages users.",
  reviewer: "Uploads contracts, reviews the ones assigned to them (or unassigned ones), comments, dismisses non-serious items, edits deals they own.",
  viewer: "Reads reports, exports and the register. Can't change anything.",
};

export type Action =
  | "contract.upload"
  | "review.start"
  | "review.take"
  | "finding.comment"
  | "finding.dismiss"
  | "finding.dismiss_serious"
  | "finding.accept"
  | "decision.set"
  | "review.assign"
  | "assignment.complete"
  | "deal.edit"
  | "contract.delete"
  | "contract.delete_request"
  | "decision.request"
  | "deal.note"
  | "offer.record"
  | "review.mark"
  | "counsel.ask"
  | "counsel.answer"
  | "register.edit"
  | "demo.reset"
  | "users.manage"
  | "activity.view";

export type Actor = { name: string; role: Role };
export type Context = { dealOwner?: string | null; assignee?: string | null; severity?: string | null };

const ADMIN_ONLY: Action[] = ["contract.delete", "finding.dismiss_serious", "finding.accept", "decision.set", "review.assign", "register.edit", "demo.reset", "users.manage", "counsel.ask"];
const REVIEWER: Action[] = ["contract.upload", "review.start", "finding.comment", "finding.dismiss", "activity.view", "deal.note", "offer.record"];

export function can(user: Actor | null | undefined, action: Action, ctx: Context = {}): boolean {
  if (!user) return false;
  // Outside counsel (a viewer) answers the questions shared with them; nobody else answers for counsel, admins included.
  if (action === "counsel.answer") return user.role === "viewer";
  if (user.role === "admin") return true;
  if (ADMIN_ONLY.includes(action)) return false;
  if (action === "activity.view") return true; // everyone signed in can read the log
  if (user.role === "viewer") return false;
  // reviewer
  if (action === "finding.dismiss") return ctx.severity !== "serious";
  // An assigned contract is reviewed (AI run started) by its assignee; an unassigned one by any reviewer.
  if (action === "review.start") return !ctx.assignee || ctx.assignee === user.name;
  // A reviewer can take an unassigned contract for themselves.
  if (action === "review.take") return !ctx.assignee;
  // The deal owner edits the deal and its contracts, deletes them, and can ask Karandeep for a quick decision.
  if (action === "deal.edit" || action === "contract.delete_request" || action === "decision.request") return !!ctx.dealOwner && ctx.dealOwner === user.name;
  if (action === "assignment.complete" || action === "review.mark") return !!ctx.assignee && ctx.assignee === user.name;
  return REVIEWER.includes(action);
}

/** The plain-language refusal shown when `can` says no. */
export function refusal(action: Action, ctx: Context = {}): string {
  switch (action) {
    case "finding.dismiss_serious":
    case "finding.dismiss":
      return ctx.severity === "serious" ? "Only an admin can dismiss a Serious finding." : "Viewers can't change findings.";
    case "finding.accept":
      return "Only an admin can accept a Serious risk.";
    case "decision.set":
      return "Only an admin records the decision.";
    case "review.assign":
      return "Only an admin assigns contracts to other people.";
    case "review.start":
      return ctx.assignee ? `This contract is assigned to ${ctx.assignee}. Only they or an admin can start its review.` : "Your role can't start reviews.";
    case "review.take":
      return ctx.assignee ? `Already assigned to ${ctx.assignee}.` : "Your role can't take reviews.";
    case "assignment.complete":
      return `Only ${ctx.assignee ?? "the assigned reviewer"} or an admin can mark this review done.`;
    case "deal.edit":
      return `Only ${ctx.dealOwner ?? "the deal owner"} or an admin can edit this deal.`;
    case "contract.delete":
      return "Only an admin deletes a contract. The deal owner can ask for it to be deleted.";
    case "contract.delete_request":
      return `Only ${ctx.dealOwner ?? "the deal owner"} can ask for this contract to be deleted.`;
    case "decision.request":
      return `Only ${ctx.dealOwner ?? "the deal owner"} can ask for a quick decision.`;
    case "register.edit":
      return "Only an admin changes the register.";
    case "demo.reset":
      return "Only an admin can reset the demo.";
    case "users.manage":
      return "Only an admin manages users.";
    case "review.mark":
      return `Only ${ctx.assignee ?? "the assigned reviewer"} or an admin can mark this review.`;
    case "counsel.ask":
      return "Only an admin shares questions with counsel.";
    case "counsel.answer":
      return "Only counsel answers counsel questions.";
    default:
      return "Your role can't do this. Ask an admin if you need access.";
  }
}

/** The yes/no flags client components need, computed once on the server from the user's role. */
export type Perms = {
  role: Role;
  upload: boolean;
  review: boolean;
  comment: boolean;
  dismiss: boolean;
  dismissSerious: boolean;
  accept: boolean;
  decide: boolean;
  assign: boolean;
  registerEdit: boolean;
  manageUsers: boolean;
  resetDemo: boolean;
};

export function permsFor(user: Actor): Perms {
  return {
    role: user.role,
    upload: can(user, "contract.upload"),
    review: can(user, "review.start"),
    comment: can(user, "finding.comment"),
    dismiss: can(user, "finding.dismiss", { severity: "minor" }),
    dismissSerious: can(user, "finding.dismiss_serious"),
    accept: can(user, "finding.accept"),
    decide: can(user, "decision.set"),
    assign: can(user, "review.assign"),
    registerEdit: can(user, "register.edit"),
    manageUsers: can(user, "users.manage"),
    resetDemo: can(user, "demo.reset"),
  };
}
