// Arithmetic against the deal value (O7). Always code, never the model (G5).

export function money(amount: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "INR" ? "₹" : `${currency} `;
  const rounded = Math.abs(amount) >= 100 ? Math.round(amount) : Math.round(amount * 100) / 100;
  return `${symbol}${rounded.toLocaleString("en-US")}`;
}

export type PenaltyMath = {
  perPeriod: number | null;
  periodLabel: "day" | "week" | "month" | null;
  periodsToFullFee: number | null;
  text: string;
};

/** "2% of total fees per day" on $180,000 → $3,600 a day; the full fee in 50 days. */
export function penaltyMath(args: {
  ratePct: number | null;
  period: "day" | "week" | "month" | "once" | null;
  basis: string | null;
  valueUsd: number | null;
  currency?: string;
  capped: boolean;
}): PenaltyMath {
  const { ratePct, period, basis, valueUsd, capped } = args;
  const currency = args.currency ?? "USD";
  if (ratePct == null || ratePct <= 0 || !period || period === "once") {
    return { perPeriod: null, periodLabel: null, periodsToFullFee: null, text: "" };
  }
  const onWholeFee = !basis || /total|contract|whole|aggregate|fees\b|value/i.test(basis) && !/milestone/i.test(basis);
  const periodsToFullFee = capped ? null : Math.ceil(100 / ratePct);
  if (onWholeFee && valueUsd) {
    const perPeriod = (ratePct / 100) * valueUsd;
    const text =
      `${money(perPeriod, currency)} a ${period}` +
      (periodsToFullFee ? `; reaches the full ${money(valueUsd, currency)} fee in ${periodsToFullFee} ${period}s` : "");
    return { perPeriod, periodLabel: period, periodsToFullFee, text };
  }
  const text = `${ratePct}% of the ${basis ?? "fee"} a ${period}` + (periodsToFullFee ? `; 100% of it after ${periodsToFullFee} ${period}s` : "");
  return { perPeriod: null, periodLabel: period, periodsToFullFee, text };
}

/** A liability cap as a multiple of the deal value (null if it cannot be computed). */
export function capMultiple(args: { capAmount: number | null; capMultipleOfFees: number | null; capPct: number | null; valueUsd: number | null }): number | null {
  if (args.capMultipleOfFees != null) return args.capMultipleOfFees;
  if (args.capPct != null) return args.capPct / 100;
  if (args.capAmount != null && args.valueUsd) return args.capAmount / args.valueUsd;
  return null;
}

export const fmtMultiple = (m: number) => `${Math.round(m * 10) / 10}×`;
