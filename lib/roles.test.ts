import { describe, expect, it } from "vitest";
import { isRole, navFor, ROLES } from "./roles";

describe("roles", () => {
  it("accepts only the three demo roles", () => {
    expect(isRole("ceo")).toBe(true);
    expect(isRole("counsel")).toBe(true);
    expect(isRole("admin")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("gives counsel a shorter nav than the CEO", () => {
    expect(navFor("counsel").length).toBeLessThan(navFor("ceo").length);
    expect(navFor("counsel").map((n) => n.href)).toContain("/register");
  });

  it("every role has a home that is in its nav", () => {
    for (const r of Object.values(ROLES)) {
      expect(r.nav.map((n) => n.href)).toContain(r.home);
    }
  });
});
