import { afterEach, describe, expect, it } from "vitest";
import { appToday, DEFAULT_TODAY, toAppDay } from "./config";

describe("appToday", () => {
  const original = process.env.APP_TODAY;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_TODAY;
    else process.env.APP_TODAY = original;
  });

  it("falls back to the dataset's today", () => {
    delete process.env.APP_TODAY;
    expect(appToday()).toBe(DEFAULT_TODAY);
  });

  it("uses a well-formed APP_TODAY", () => {
    process.env.APP_TODAY = "2026-10-14";
    expect(appToday()).toBe("2026-10-14");
  });

  it("ignores a malformed APP_TODAY", () => {
    process.env.APP_TODAY = "14 Oct 2026";
    expect(appToday()).toBe(DEFAULT_TODAY);
  });
});

describe("toAppDay", () => {
  it("moves a real timestamp onto the APP_TODAY calendar", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    expect(toAppDay(new Date("2026-10-15T09:00:00Z"), now)).toBe(DEFAULT_TODAY);
    expect(toAppDay(new Date("2026-10-13T09:00:00Z"), now)).toBe("2026-09-26");
  });
});
