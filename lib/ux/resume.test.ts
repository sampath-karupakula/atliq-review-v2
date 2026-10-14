import { describe, expect, it } from "vitest";
import { resumePoint } from "./resume";

describe("resumePoint", () => {
  it.each([
    ["masked", "extract"],
    ["extracting 1/3", "extract"],
    ["extracted", "checks"],
    ["checked", "clash"],
    ["clash checked", "scan"],
    ["scanning 2/4", "scan"],
    ["scanned", "bundle"],
    ["bundle checked", "finalize"],
  ])("%s → %s", (saved, next) => expect(resumePoint(saved)).toBe(next));
  it("cannot resume before masking finished or after done", () => {
    expect(resumePoint("masking")).toBeNull();
    expect(resumePoint("done")).toBeNull();
    expect(resumePoint(null)).toBeNull();
  });
});
