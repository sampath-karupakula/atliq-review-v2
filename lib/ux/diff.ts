// Paragraph diff between two versions of a contract, with word-level changes inside edited paragraphs. Pure; an
// LCS over paragraphs (contracts are a few hundred paragraphs, so O(n·m) is fine) and over words for edited pairs.

export type WordPart = { text: string; kind: "same" | "add" | "del" };
export type DiffRow =
  | { kind: "same"; left: string; right: string }
  | { kind: "add"; right: string }
  | { kind: "del"; left: string }
  | { kind: "change"; left: WordPart[]; right: WordPart[] };

const norm = (s: string) => s.replace(/^\s*#{1,6}\s+/, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

function lcs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): [number, number][] {
  const n = a.length;
  const m = b.length;
  const dp = new Int32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * (m + 1) + j] = eq(a[i], b[j]) ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) i++;
    else j++;
  }
  return pairs;
}

export function wordDiff(a: string, b: string): { left: WordPart[]; right: WordPart[] } {
  const wa = a.split(/(\s+)/).filter((w) => w !== "");
  const wb = b.split(/(\s+)/).filter((w) => w !== "");
  const pairs = lcs(wa, wb, (x, y) => x === y);
  const left: WordPart[] = [];
  const right: WordPart[] = [];
  let i = 0;
  let j = 0;
  const push = (arr: WordPart[], text: string, kind: WordPart["kind"]) => {
    const last = arr.at(-1);
    if (last && last.kind === kind) last.text += text;
    else arr.push({ text, kind });
  };
  for (const [pi, pj] of [...pairs, [wa.length, wb.length] as [number, number]]) {
    while (i < pi) push(left, wa[i++], "del");
    while (j < pj) push(right, wb[j++], "add");
    if (pi < wa.length) {
      push(left, wa[pi], "same");
      push(right, wb[pj], "same");
      i = pi + 1;
      j = pj + 1;
    }
  }
  return { left, right };
}

/** How similar two paragraphs are (shared words / longer length), to decide "edited" vs "replaced". */
function similarity(a: string, b: string): number {
  const wa = a.split(/\s+/);
  const wb = b.split(/\s+/);
  return lcs(wa, wb, (x, y) => x === y).length / Math.max(wa.length, wb.length, 1);
}

export function diffParagraphs(oldText: string, newText: string): DiffRow[] {
  const a = oldText.split("\n").map(norm).filter(Boolean);
  const b = newText.split("\n").map(norm).filter(Boolean);
  const pairs = lcs(a, b, (x, y) => x === y);
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  const flush = (dels: string[], adds: string[]) => {
    // Pair removed and added paragraphs in order when they are clearly the same clause, edited.
    while (dels.length && adds.length && similarity(dels[0], adds[0]) >= 0.4) {
      const d = dels.shift()!;
      const ad = adds.shift()!;
      rows.push({ kind: "change", ...wordDiff(d, ad) });
    }
    for (const d of dels) rows.push({ kind: "del", left: d });
    for (const ad of adds) rows.push({ kind: "add", right: ad });
  };
  for (const [pi, pj] of [...pairs, [a.length, b.length] as [number, number]]) {
    flush(a.slice(i, pi), b.slice(j, pj));
    if (pi < a.length) rows.push({ kind: "same", left: a[pi], right: b[pj] });
    i = pi + 1;
    j = pj + 1;
  }
  return rows;
}

export function diffStats(rows: DiffRow[]) {
  return {
    changed: rows.filter((r) => r.kind === "change").length,
    added: rows.filter((r) => r.kind === "add").length,
    removed: rows.filter((r) => r.kind === "del").length,
    same: rows.filter((r) => r.kind === "same").length,
  };
}
