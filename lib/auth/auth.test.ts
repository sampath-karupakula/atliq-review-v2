import { describe, expect, it } from "vitest";
import { can, type Action } from "./permissions";
import { hashPassword, passwordProblem, temporaryPassword, verifyPassword } from "./password";

const admin = { name: "Karandeep", role: "admin" as const };
const dhaval = { name: "Dhaval", role: "reviewer" as const };
const counsel = { name: "Counsel", role: "viewer" as const };

describe("permissions", () => {
  it("admins can do everything", () => {
    for (const a of ["finding.dismiss_serious", "decision.set", "users.manage", "register.edit", "demo.reset"] as Action[]) expect(can(admin, a)).toBe(true);
  });
  it("reviewers work on contracts but not on Serious items, decisions, register or users", () => {
    expect(can(dhaval, "contract.upload")).toBe(true);
    expect(can(dhaval, "review.start")).toBe(true);
    expect(can(dhaval, "finding.comment")).toBe(true);
    expect(can(dhaval, "finding.dismiss", { severity: "negotiable" })).toBe(true);
    expect(can(dhaval, "finding.dismiss", { severity: "serious" })).toBe(false);
    for (const a of ["finding.dismiss_serious", "finding.accept", "decision.set", "review.assign", "register.edit", "users.manage", "demo.reset"] as Action[]) expect(can(dhaval, a)).toBe(false);
  });
  it("an assigned contract is reviewed by its assignee; unassigned ones can be taken", () => {
    expect(can(dhaval, "review.start", { assignee: "Dhaval" })).toBe(true);
    expect(can(dhaval, "review.start", { assignee: "Jay" })).toBe(false);
    expect(can(dhaval, "review.start", {})).toBe(true);
    expect(can(admin, "review.start", { assignee: "Jay" })).toBe(true);
    expect(can(dhaval, "review.take", {})).toBe(true);
    expect(can(dhaval, "review.take", { assignee: "Jay" })).toBe(false);
    expect(can(counsel, "review.take", {})).toBe(false);
  });
  it("reviewers edit only their own deals and complete only their own assignments", () => {
    expect(can(dhaval, "deal.edit", { dealOwner: "Dhaval" })).toBe(true);
    expect(can(dhaval, "deal.edit", { dealOwner: "Jay" })).toBe(false);
    // Deleting always needs an admin: the owner only asks.
    expect(can(dhaval, "contract.delete", { dealOwner: "Dhaval" })).toBe(false);
    expect(can(dhaval, "contract.delete_request", { dealOwner: "Dhaval" })).toBe(true);
    expect(can(dhaval, "contract.delete_request", { dealOwner: "Jay" })).toBe(false);
    // Signed contracts feed every clash check, so only an admin adds them.
    expect(can(dhaval, "signed.upload")).toBe(false);
    expect(can({ name: "Karandeep", role: "admin" }, "signed.upload")).toBe(true);
    expect(can(dhaval, "decision.request", { dealOwner: "Dhaval" })).toBe(true);
    expect(can(dhaval, "assignment.complete", { assignee: "Dhaval" })).toBe(true);
    expect(can(dhaval, "assignment.complete", { assignee: "Jay" })).toBe(false);
  });
  it("viewers are read-only", () => {
    for (const a of ["contract.upload", "review.start", "finding.comment", "finding.dismiss", "deal.edit", "contract.delete", "contract.delete_request", "decision.request", "assignment.complete"] as Action[]) {
      expect(can(counsel, a, { dealOwner: "Counsel", assignee: "Counsel" })).toBe(false);
    }
    expect(can(counsel, "activity.view")).toBe(true);
  });
  it("signed-out users can do nothing", () => {
    expect(can(null, "activity.view")).toBe(false);
  });
});

describe("passwords", () => {
  it("hash and verify", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong horse battery", h)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
  it("rules", () => {
    expect(passwordProblem("short")).toMatch(/10 characters/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/repeat/);
    expect(passwordProblem("dhaval-is-great-2026", { name: "Dhaval" })).toMatch(/name/);
    expect(passwordProblem("my-atliq-login-99")).toMatch(/common/);
    expect(passwordProblem("blue-river-stone-42")).toBeNull();
  });
  it("temporary passwords pass the rules", () => {
    for (let i = 0; i < 20; i++) expect(passwordProblem(temporaryPassword())).toBeNull();
  });
});
