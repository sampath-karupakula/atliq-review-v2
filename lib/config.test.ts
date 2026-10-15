import { afterEach, describe, expect, it } from "vitest";
import { appToday, DATASET_TODAY, realToday, toAppDay } from "./config";

describe("appToday", () => {
  const original = process.env.APP_TODAY;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_TODAY;
    else process.env.APP_TODAY = original;
  });

  it("uses today's real date (India time) when APP_TODAY isn't set", () => {
    delete process.env.APP_TODAY;
    expect(appToday()).toBe(realToday());
    expect(realToday(new Date("2026-10-14T20:00:00Z"))).toBe("2026-10-15"); // 01:30 the next day in Pune
  });

  it("uses a well-formed APP_TODAY", () => {
    process.env.APP_TODAY = "2026-10-14";
    expect(appToday()).toBe("2026-10-14");
  });

  it("ignores a malformed APP_TODAY", () => {
    process.env.APP_TODAY = "14 Oct 2026";
    expect(appToday()).toBe(realToday());
  });
});

describe("toAppDay", () => {
  it("moves a real timestamp onto the APP_TODAY calendar", () => {
    process.env.APP_TODAY = DATASET_TODAY;
    const now = new Date("2026-10-15T10:00:00Z");
    expect(toAppDay(new Date("2026-10-15T09:00:00Z"), now)).toBe(DATASET_TODAY);
    expect(toAppDay(new Date("2026-10-13T09:00:00Z"), now)).toBe("2026-09-26");
  });
});
