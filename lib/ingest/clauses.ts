// Clause splitting. Two outputs:
// 1. The user-facing clause count uses the `N.N` rule from ROADMAP §7.1. It equals `clauses_numbered`
//    in test_contracts/expected_results.json, so "read N of N clauses" is comparable with the answer key.
// 2. A full segment list (numbered clauses, schedule items like S1.4, table rows, headings, the parties
//    block and the title) so every quote can be located, including quotes from schedules and tables.

export const NUMBERED_CLAUSE = /^\s*(\d{1,2})\.(\d{1,2})\s/gm;
export const SCHEDULE_ITEM = /^\s*(?:\*\*)?S(\d{1,2})\.(\d{1,2})\b/gm;

export function countNumberedClauses(text: string): number {
  return text.match(NUMBERED_CLAUSE)?.length ?? 0;
}

export function countScheduleItems(text: string): number {
  return text.match(SCHEDULE_ITEM)?.length ?? 0;
}

export type SegmentKind = "title" | "parties" | "heading" | "clause" | "schedule_item" | "table_row" | "text";

export type Segment = {
  /** "Title", "Parties", "10.2", "S1.4", "Schedule 2, row 8", "§ 12 heading" … */
  id: string;
  kind: SegmentKind;
  /** The section heading it sits under, e.g. "10. DELIVERY AND LIQUIDATED DAMAGES" or "SCHEDULE 2 — PROJECT SITES". */
  section: string | null;
  text: string;
  start: number;
  end: number;
};

export type ClauseMap = {
  segments: Segment[];
  /** Distinct `N.N` clause ids in document order. */
  clauseIds: string[];
  scheduleItemIds: string[];
  clauseCount: number;
  scheduleItemCount: number;
  /** Numbered section headings ("## 3. FEES"); SOWs number sections but not clauses. */
  sectionCount: number;
  /** Ids of segments containing OCR damage (■) — their values must never be guessed. */
  unreadable: string[];
};

const RE_CLAUSE = /^\s*(\d{1,3})\.(\d{1,2})(?=\s)/;
const RE_SCHEDULE_ITEM = /^\s*(?:\*\*)?S(\d{1,2})\.(\d{1,2})\b/;
const RE_HEADING = /^\s*(#{1,6})\s+(.*?)\s*$/;
const RE_TABLE_ROW = /^\s*\|.*\|\s*$/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const RE_SCHEDULE_HEADING = /^(SCHEDULE|ANNEX|ANNEXURE|EXHIBIT|APPENDIX|ATTACHMENT)\b\s*([A-Z0-9]+)?/i;
const UNREADABLE = /■/;

function stripMd(s: string): string {
  return s.replace(/\*\*/g, "").replace(/__/g, "").trim();
}

/** "SCHEDULE 2 — PROJECT SITES" → "Schedule 2"; "ENGAGEMENT SCHEDULE" → "Engagement Schedule". */
function scheduleLabel(heading: string): string | null {
  const h = stripMd(heading);
  const m = h.match(RE_SCHEDULE_HEADING);
  if (m) {
    const word = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    return m[2] ? `${word} ${m[2]}` : word;
  }
  if (/\bSCHEDULE\b/i.test(h)) {
    return h
      .split(/\s+[—–-]\s+/)[0]
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return null;
}

export function splitClauses(text: string): ClauseMap {
  const segments: Segment[] = [];
  let section: string | null = null;
  let sectionNum: string | null = null;
  let sectionCount = 0;
  let schedule: string | null = null;
  let current: Segment | null = null;
  let seenTitle = false;
  let seenNumbered = false;
  let tableRow = 0;
  let inTable = false;

  const close = (end: number) => {
    if (current) {
      current.end = end;
      current.text = text.slice(current.start, end).replace(/\s+$/, "");
      segments.push(current);
      current = null;
    }
  };
  const open = (id: string, kind: SegmentKind, start: number) => {
    current = { id, kind, section, text: "", start, end: start };
  };

  let offset = 0;
  for (const rawLine of text.split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + rawLine.length;
    offset = lineEnd + 1;
    const line = rawLine;

    if (!line.trim()) {
      // Blank lines end tables but not clauses (clauses can span paragraphs/bullets).
      if (inTable) {
        close(lineStart);
        inTable = false;
      }
      continue;
    }

    const heading = line.match(RE_HEADING);
    if (heading) {
      close(lineStart);
      inTable = false;
      const level = heading[1].length;
      const title = stripMd(heading[2]);
      if (level === 1 && !seenTitle) {
        seenTitle = true;
        segments.push({ id: "Title", kind: "title", section: null, text: line.trim(), start: lineStart, end: lineEnd });
        open("Parties", "parties", lineEnd + 1);
        continue;
      }
      section = title;
      const num = title.match(/^(?:ARTICLE\s+|SECTION\s+|§\s*)?(\d{1,2})[.\s]/i);
      sectionNum = num ? num[1] : null;
      if (num) sectionCount += 1;
      const label = scheduleLabel(title);
      if (label) schedule = label;
      else if (level <= 2) schedule = null;
      segments.push({ id: `heading: ${title}`, kind: "heading", section, text: line.trim(), start: lineStart, end: lineEnd });
      continue;
    }

    const clause = line.match(RE_CLAUSE);
    if (clause && !inTable) {
      close(lineStart);
      seenNumbered = true;
      open(`${+clause[1]}.${+clause[2]}`, "clause", lineStart);
      continue;
    }

    const item = line.match(RE_SCHEDULE_ITEM);
    if (item) {
      close(lineStart);
      inTable = false;
      open(`S${+item[1]}.${+item[2]}`, "schedule_item", lineStart);
      continue;
    }

    if (RE_TABLE_ROW.test(line)) {
      if (!inTable) {
        // First row of a table is its header row.
        close(lineStart);
        inTable = true;
        tableRow = 0;
        segments.push({
          id: `${schedule ?? section ?? "Table"}, header`,
          kind: "table_row",
          section,
          text: line.trim(),
          start: lineStart,
          end: lineEnd,
        });
        continue;
      }
      if (RE_TABLE_SEP.test(line)) continue;
      tableRow += 1;
      segments.push({
        id: `${schedule ?? section ?? "Table"}, row ${tableRow}`,
        kind: "table_row",
        section,
        text: line.trim(),
        start: lineStart,
        end: lineEnd,
      });
      continue;
    }
    inTable = false;

    // Continuation line. Text before any heading/clause is the parties block or free text.
    if (!current) {
      if (!seenNumbered && !section) open("Parties", "parties", lineStart);
      else if (sectionNum && !schedule) open(`Section ${sectionNum}`, "text", lineStart);
      else open(`${schedule ?? section ?? "Text"}, text`, "text", lineStart);
    }
  }
  close(text.length);

  const merged = mergeDuplicates(segments.filter((s) => s.text.trim().length > 0));
  const clauseIds = unique(merged.filter((s) => s.kind === "clause").map((s) => s.id));
  const scheduleItemIds = unique(merged.filter((s) => s.kind === "schedule_item").map((s) => s.id));
  return {
    segments: merged,
    clauseIds,
    scheduleItemIds,
    clauseCount: countNumberedClauses(text),
    scheduleItemCount: countScheduleItems(text),
    sectionCount,
    unreadable: unique(merged.filter((s) => UNREADABLE.test(s.text)).map((s) => s.id)),
  };
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Consecutive "text" segments with the same id are one block. */
function mergeDuplicates(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.id === s.id && (s.kind === "text" || s.kind === "parties")) {
      prev.end = s.end;
      prev.text = `${prev.text}\n${s.text}`;
    } else out.push({ ...s });
  }
  return out;
}

/** The segment whose span contains the character offset. */
export function segmentAt(map: ClauseMap, offset: number): Segment | undefined {
  return map.segments.find((s) => offset >= s.start && offset <= s.end);
}

/** Clause-tagged text for the AI: every segment prefixed with its id, so the model can cite it. */
export function renderForAi(map: ClauseMap): string {
  return map.segments
    .map((s) => (s.kind === "heading" || s.kind === "title" ? s.text : `[${s.id}] ${s.text}`))
    .join("\n\n");
}
