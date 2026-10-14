// Minimal HTML → Markdown for mammoth's DOCX output: headings, paragraphs, bold, lists and tables.
// Keeping headings and table rows means Word uploads split into clauses exactly like the Markdown originals.

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

function decode(s: string): string {
  return s
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e] ?? e)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function inline(html: string): string {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_, __, t) => (t.trim() ? `**${t}**` : t))
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\*\*\s*\*\*/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function htmlToMarkdown(html: string): string {
  const out: string[] = [];
  const blocks = html.match(/<(h[1-6]|p|li|table)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks) {
    const tag = block.match(/^<(\w+)/)![1].toLowerCase();
    if (tag === "table") {
      const rows = block.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
      rows.forEach((row, i) => {
        const cells = (row.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map((c) => inline(c.replace(/<\/?p[^>]*>/gi, " ")));
        out.push(`| ${cells.join(" | ")} |`);
        if (i === 0) out.push(`|${cells.map(() => "---").join("|")}|`);
      });
      out.push("");
      continue;
    }
    const text = inline(block);
    if (!text) continue;
    if (tag.startsWith("h")) out.push(`${"#".repeat(+tag[1])} ${text.replace(/^\*\*|\*\*$/g, "")}`, "");
    else if (tag === "li") out.push(`- ${text}`);
    else out.push(text, "");
  }
  return out.join("\n");
}
