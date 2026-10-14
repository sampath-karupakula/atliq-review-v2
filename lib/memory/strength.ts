// How strongly AtliQ holds a usual term, from what the baseline says about it: a count across contracts, a list
// of past negotiations, Karandeep's written checklist, one past example, or nothing on file. Shown as a three-step bar.
export type Strength = { level: 0 | 1 | 2 | 3; label: string; pct: number | null };

export function termStrength(count: string | null, source: string | null): Strength {
  const ofM = count?.match(/(\d+)\s+of\s+(\d+)/);
  if (ofM) {
    const n = Number(ofM[1]), m = Number(ofM[2]);
    const pct = m ? Math.round((n / m) * 100) : 0;
    return { level: pct >= 70 ? 3 : pct >= 40 ? 2 : 1, label: `In ${n} of ${m} signed contracts`, pct };
  }
  if (count) {
    const k = count.split(/,\s*(?![^()]*\))/).filter((s) => s.trim()).length;
    return { level: k >= 3 ? 3 : k === 2 ? 2 : 1, label: `Agreed in ${k} negotiation${k === 1 ? "" : "s"}`, pct: null };
  }
  if (source && /checklist/i.test(source)) return { level: 3, label: "Karandeep's written rule", pct: null };
  if (source) return { level: 2, label: "One past example", pct: null };
  return { level: 0, label: "No source on file", pct: null };
}
