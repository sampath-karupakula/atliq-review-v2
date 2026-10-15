// Which signed contract a past negotiation position came from. Positions are stored by short name and month
// ("Crestline", "2024-07"); signed contracts by full legal name and date ("Crestline Retail Inc", "2024-08-01").
// Pure, so the report and the register link the same way and the matching is unit-tested.

export type SignedRef = { id: string; counterparty: string; signedDate: string | null; title: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const months = (d: string) => {
  const [y, m] = d.split("-").map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
};

/** The signed contract whose counterparty starts with the position's name, closest in date; null when none is on file. */
export function sourceContract(p: { counterparty: string; date: string }, signed: SignedRef[]): SignedRef | null {
  const name = norm(p.counterparty);
  if (!name) return null;
  const hits = signed.filter((s) => {
    const n = norm(s.counterparty);
    return n === name || n.startsWith(`${name} `);
  });
  if (!hits.length) return null;
  const gap = (s: SignedRef) => (s.signedDate ? Math.abs(months(s.signedDate) - months(p.date)) : 999);
  return [...hits].sort((a, b) => gap(a) - gap(b))[0] ?? null;
}
