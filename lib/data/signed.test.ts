import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { findSignedDate } = await import("./signed");

describe("findSignedDate", () => {
  it("reads common date formats after a signing phrase", () => {
    expect(findSignedDate("This Agreement is dated 15 March 2025 between …")).toBe("2025-03-15");
    expect(findSignedDate("Effective Date: March 1, 2026")).toBe("2026-03-01");
    expect(findSignedDate("executed on 2025-10-06 by the parties")).toBe("2025-10-06");
    expect(findSignedDate("entered into on 22nd January 2025")).toBe("2025-01-22");
  });

  it("returns null rather than guessing", () => {
    expect(findSignedDate("Payment within 30 days of 1 April.")).toBeNull();
    expect(findSignedDate("dated the day of signature")).toBeNull();
  });
});
