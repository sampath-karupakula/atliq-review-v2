import { describe, expect, it } from "vitest";
import { displayLines } from "./display";

describe("displayLines keeps highlight offsets exact", () => {
  const text = "# MASTER AGREEMENT\n\n## 10. DELAY\n\n10.2 The **Supplier** pays two percent (2%) per day.\n| Role | Rate |\n|---|---|\n| SDE | USD 78 |";
  const lines = displayLines(text);
  it("hides markers and classifies lines", () => {
    expect(lines.map((l) => l.kind)).toEqual(["title", "text", "heading", "text", "text", "table", "table"]);
    expect(lines[4].text).toBe("10.2 The Supplier pays two percent (2%) per day.");
  });
  it("maps every display character back to the original", () => {
    for (const l of lines) for (let k = 0; k < l.text.length; k++) expect(text[l.map[k]]).toBe(l.text[k]);
  });
  it("a quote's original range maps onto the right display characters", () => {
    const q = "two percent (2%) per day";
    const start = text.indexOf(q);
    const l = lines[4];
    const from = l.map.findIndex((o) => o >= start);
    expect(l.text.slice(from, from + q.length)).toBe(q);
  });
});

import { clauseLabel } from "./display";

describe("clauseLabel", () => {
  it.each([
    ["10.2", "Clause 10.2"],
    ["9.1, 9.3", "Clauses 9.1, 9.3"],
    ["S1.4", "Schedule item S1.4"],
    ["Schedule 1, row 1", "Schedule 1, table row 1"],
    ["Engagement Schedule, row 3", "Engagement Schedule, table row 3"],
    ["SIGNATURES, text", "Signature block"],
    ["RECITALS, text", "Recitals"],
    ["Parties", "Parties block"],
    ["Schedule 2, text", "Schedule 2"],
    ["Title", "Title"],
  ])("%s → %s", (input, out) => expect(clauseLabel(input)).toBe(out));
  it("is empty for no clause", () => expect(clauseLabel(null)).toBe(""));
});
