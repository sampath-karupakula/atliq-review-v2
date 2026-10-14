// Liberal parsing of a typed deal value (Postel's law): "88k", "$140,000", "EUR 88,000", "1.2m", "₹50 lakh".

export type ParsedMoney = { value: number; currency: string | null };

const SYMBOL: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "₹": "INR" };
const CODES = ["USD", "EUR", "GBP", "INR"];

export function parseMoney(input: string | null | undefined): ParsedMoney | null {
  if (!input) return null;
  let s = input.trim();
  if (!s) return null;
  let currency: string | null = null;
  for (const [sym, code] of Object.entries(SYMBOL)) {
    if (s.includes(sym)) {
      currency = code;
      s = s.replaceAll(sym, "");
    }
  }
  const code = CODES.find((c) => s.toUpperCase().includes(c));
  if (code) {
    currency = code;
    s = s.replace(new RegExp(code, "ig"), "");
  }
  s = s.replace(/,/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(k|thousand|m|mn|million|lakh|lac|cr|crore)?$/);
  if (!m) return null;
  const mult: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, lakh: 1e5, lac: 1e5, cr: 1e7, crore: 1e7 };
  const value = Math.round(parseFloat(m[1]) * (m[2] ? mult[m[2]] : 1));
  return Number.isFinite(value) ? { value, currency } : null;
}
