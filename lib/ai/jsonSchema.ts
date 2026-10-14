// Zod → JSON Schema for structured outputs, in the strict shape both providers accept:
// every object has `additionalProperties: false` and lists every property in `required`
// (optional values are modelled as nullable, never as missing keys). No min/max/pattern constraints.
import { z } from "zod";

type Json = { [k: string]: unknown };

const DROP = new Set(["$schema", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "pattern", "format", "minItems", "maxItems", "default"]);

function strictify(node: unknown, compact: boolean): unknown {
  if (Array.isArray(node)) return node.map((n) => strictify(n, compact));
  if (!node || typeof node !== "object") return node;
  const src = node as Json;
  // Compact nullable form: anyOf [{type: X}, {type: "null"}] → {type: [X, "null"]} (smaller prompt for Groq).
  if (compact && Array.isArray(src.anyOf) && src.anyOf.length === 2) {
    const [a, b] = src.anyOf as Json[];
    const nullFirst = a?.type === "null";
    const other = nullFirst ? b : a;
    const isNull = (nullFirst ? a : b)?.type === "null";
    if (isNull && other && typeof other.type === "string" && Object.keys(other).every((k) => ["type", "enum", ...DROP].includes(k))) {
      const merged: Json = { type: [other.type, "null"] };
      if (other.enum) merged.enum = [...(other.enum as unknown[]), null];
      return merged;
    }
  }
  const out: Json = {};
  for (const [k, v] of Object.entries(src)) {
    if (DROP.has(k)) continue;
    out[k] = strictify(v, compact);
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as Json);
  }
  return out;
}

export function toStrictJsonSchema(schema: z.ZodType, opts: { compactNullable?: boolean } = {}): Json {
  return strictify(z.toJSONSchema(schema, { target: "draft-7", io: "output" }), !!opts.compactNullable) as Json;
}

/**
 * Fills structural gaps in a model reply before validation: a missing list → [], a missing nullable value → null,
 * a missing boolean → false, a missing object → filled recursively. These all mean "not found"; no value is invented.
 * Required strings and numbers that are missing stay missing, so validation still fails (and the call is retried).
 */
export function fillDefaults(schema: Json, value: unknown): unknown {
  const types = Array.isArray(schema.type) ? (schema.type as string[]) : schema.type ? [schema.type as string] : [];
  if (Array.isArray(schema.anyOf) && value === undefined && (schema.anyOf as Json[]).some((s) => s.type === "null")) return null;
  if (value === undefined) {
    if (types.includes("null")) return null;
    if (types.includes("array")) return [];
    if (types.includes("boolean")) return false;
    if (types.includes("object")) return fillDefaults(schema, {});
    return undefined;
  }
  if (types.includes("object") && value && typeof value === "object" && !Array.isArray(value)) {
    const props = (schema.properties ?? {}) as Record<string, Json>;
    const out: Json = { ...(value as Json) };
    for (const [k, sub] of Object.entries(props)) {
      const filled = fillDefaults(sub, out[k]);
      if (filled !== undefined) out[k] = filled;
    }
    return out;
  }
  if (types.includes("array") && Array.isArray(value) && schema.items) {
    const items = schema.items as Json;
    // A list of objects with stray strings in it: drop the strays (they carry no clause or quote).
    const kept = items.type === "object" ? value.filter((v) => v && typeof v === "object" && !Array.isArray(v)) : value;
    return kept.map((v) => fillDefaults(items, v));
  }
  // A yes/no fact the model left as null means "not found".
  if (value === null && types.includes("boolean") && !types.includes("null")) return false;
  // An option outside the allowed list: unknown (null) when allowed, else the catch-all "other" when it exists.
  if (Array.isArray(schema.enum) && value !== null && !(schema.enum as unknown[]).includes(value)) {
    if ((schema.enum as unknown[]).includes(null) || types.includes("null")) return null;
    if ((schema.enum as unknown[]).includes("other")) return "other";
  }
  return value;
}

/** Throws if a schema uses `.optional()` (missing keys are not allowed in strict mode; use `.nullable()`). */
export function assertStrictCompatible(schema: z.ZodType): void {
  const raw = z.toJSONSchema(schema, { target: "draft-7", io: "output" }) as Json;
  const walk = (n: unknown, path: string) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach((x, i) => walk(x, `${path}[${i}]`));
    const o = n as Json;
    if (o.type === "object" && o.properties) {
      const req = new Set((o.required as string[]) ?? []);
      for (const key of Object.keys(o.properties as Json)) {
        if (!req.has(key)) throw new Error(`Schema field ${path}.${key} is optional; use .nullable() instead`);
      }
    }
    for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
  };
  walk(raw, "$");
}
