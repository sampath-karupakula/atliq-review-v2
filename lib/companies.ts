// Company identity. One company per client or counterparty, whatever the spelling on each document.

const SUFFIXES = [
  "private limited",
  "pvt ltd",
  "pvt",
  "limited",
  "ltd",
  "llp",
  "llc",
  "fz-llc",
  "fz llc",
  "fzco",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "ag",
  "plc",
  "sa",
  "bv",
];

/** "Harrington Health Systems, Inc." → "harrington health systems"; "Sunrise Foods Pvt Ltd" → "sunrise foods". */
export function companyKey(name: string): string {
  let k = name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // "(intercompany)"
    .replace(/&/g, " and ")
    .replace(/[.,'’"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let changed = true; changed; ) {
    changed = false;
    for (const suf of SUFFIXES) {
      if (k.endsWith(` ${suf}`)) {
        k = k.slice(0, -suf.length - 1).trim();
        changed = true;
      }
    }
  }
  return k.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** The name to show: the most formal spelling seen (the one with a legal suffix, else the longest). */
export function preferredName(names: string[]): string {
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const formal = clean.filter((n) => companyKey(n) !== n.toLowerCase().replace(/[.,]/g, "").trim());
  const pool = formal.length ? formal : clean;
  return pool.sort((a, b) => b.length - a.length)[0] ?? "";
}
