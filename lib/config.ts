// Runtime configuration read from the environment. Everything date-related uses `appToday()`, the dataset's
// "today", so live/expired status is stable in the demo and in the evals.

export const DEFAULT_TODAY = "2026-09-28";

export function appToday(): string {
  const v = process.env.APP_TODAY?.trim();
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : DEFAULT_TODAY;
}
