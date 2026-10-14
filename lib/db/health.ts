import { getSql } from "./client";

export type DbHealth = { ok: true; version: string; ms: number } | { ok: false; error: string };

export async function checkDb(): Promise<DbHealth> {
  const started = Date.now();
  try {
    const [row] = await getSql()<{ version: string }[]>`select version()`;
    const version = row ? row.version.split(" ").slice(0, 2).join(" ") : "unknown";
    return { ok: true, version, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
