import { createHash } from "node:crypto";

/** Line endings and trailing whitespace normalised so the same document always hashes the same. */
export function normaliseText(text: string): string {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export function textHash(text: string): string {
  return createHash("sha256").update(normaliseText(text), "utf8").digest("hex");
}
