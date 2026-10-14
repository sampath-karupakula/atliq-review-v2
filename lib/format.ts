// Display formatting shared by pages. Money is shown in the deal's own currency; dates use lib/checks/dates.

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", INR: "₹", AED: "AED " };

export function money(value: number | null, currency = "USD"): string {
  if (value === null || Number.isNaN(value)) return "—";
  const sym = SYMBOL[currency] ?? `${currency} `;
  return sym + Math.round(value).toLocaleString(currency === "INR" ? "en-IN" : "en-US");
}

const TYPE_LABEL: Record<string, string> = {
  non_compete: "Non-compete",
  best_price: "Best price",
  partner_exclusivity: "Partner exclusivity",
  ip_assigned: "IP assigned",
};

export const commitmentTypeLabel = (t: string) => TYPE_LABEL[t] ?? t.replace(/_/g, " ");

/** "liability_cap" → "Liability cap". */
export function termLabel(t: string): string {
  const s = t.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const PRECEDENT_LABELS: Record<string, { text: string; cls: string }> = {
  standard: { text: "Standard", cls: "standard" },
  deliberate_exception: { text: "Deliberate exception · not a precedent", cls: "exception" },
  waved_through: { text: "Waved through · never copy", cls: "waved" },
  unclear: { text: "Unclear", cls: "unclear" },
};
