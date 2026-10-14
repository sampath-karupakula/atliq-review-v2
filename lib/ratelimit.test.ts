import { describe, expect, it } from "vitest";
import { rateLimit } from "./ratelimit";

describe("rateLimit", () => {
  it("allows up to max per window, then reports when to retry", () => {
    const t = 1_000_000;
    expect(rateLimit("a", 2, 60_000, t).ok).toBe(true);
    expect(rateLimit("a", 2, 60_000, t + 1).ok).toBe(true);
    const third = rateLimit("a", 2, 60_000, t + 2);
    expect(third).toEqual({ ok: false, retryAfterSec: 60 });
    expect(rateLimit("a", 2, 60_000, t + 60_001).ok).toBe(true);
  });
  it("keeps keys separate", () => {
    expect(rateLimit("b", 1, 1000, 0).ok).toBe(true);
    expect(rateLimit("c", 1, 1000, 0).ok).toBe(true);
  });
});
