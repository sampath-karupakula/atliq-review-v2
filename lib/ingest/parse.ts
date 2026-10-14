// File → plain text. PDF text layer only: scanned PDFs are stopped, never sent to the model raw
// (masking must run on text before any AI call).
import { normaliseText } from "./hash";
import { htmlToMarkdown } from "./htmlToMarkdown";

export class IngestError extends Error {
  constructor(
    public code: "unsupported_type" | "scanned_pdf" | "unreadable" | "too_large",
    message: string,
  ) {
    super(message);
  }
}

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request body limit

export const SCANNED_MESSAGE =
  "This file has no readable text (scanned). OCR is not enabled. Upload a text PDF or Word file.";

export type ParsedFile = { text: string; format: "md" | "txt" | "docx" | "pdf"; pages?: number };

export async function parseFile(bytes: Uint8Array, filename: string): Promise<ParsedFile> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new IngestError("too_large", "File is larger than 4 MB.");
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  if (ext === "md" || ext === "markdown" || ext === "txt") {
    return { text: normaliseText(new TextDecoder("utf-8").decode(bytes)), format: ext === "txt" ? "txt" : "md" };
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    try {
      const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
      return { text: normaliseText(htmlToMarkdown(value)), format: "docx" };
    } catch {
      throw new IngestError("unreadable", "This Word file could not be read. Save it again as .docx and retry.");
    }
  }

  if (ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    let pages: string[];
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      ({ text: pages } = await extractText(pdf, { mergePages: false }));
    } catch {
      throw new IngestError("unreadable", "This PDF could not be read.");
    }
    const text = normaliseText(pages.join("\n\n"));
    // Fewer than ~20 letters per page means there is no real text layer.
    const letters = (text.match(/[A-Za-z]/g) ?? []).length;
    if (letters < 20 * Math.max(1, pages.length)) throw new IngestError("scanned_pdf", SCANNED_MESSAGE);
    return { text, format: "pdf", pages: pages.length };
  }

  throw new IngestError("unsupported_type", "Upload a PDF, Word (.docx), Markdown or text file.");
}
