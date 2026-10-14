// One structured-output call to the configured provider (Anthropic or Groq).
// Guarantees (G2, G10, G11):
//  - the caller's leak guard runs on the exact outgoing text before anything is sent;
//  - the reply must parse as JSON and validate against the zod schema; one retry, then AiFailedError;
//  - only a hash of the masked prompt is recorded, never the text.
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { aiConfig, type AiConfig } from "@/lib/config";
import { assertStrictCompatible, fillDefaults, toStrictJsonSchema } from "./jsonSchema";

export type AiCallRecord = {
  step: string;
  provider: string;
  model: string;
  maskedPromptHash: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  ms: number;
  attempt: number;
  ok: boolean;
  error: string | null;
};

export type StructuredCall<T> = {
  step: string;
  /** Rules. Stable across calls so it can be cached. */
  system: string;
  /** Masked contract and reference data, wrapped in <contract>/<reference> tags by the prompt builder. */
  user: string;
  schemaName: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  /** Runs on every outgoing string; must throw if anything unmasked would be sent (assertNoLeak). */
  guard: (outgoing: string) => void;
  /** Receives one record per attempt (for the ai_calls table). */
  onCall?: (record: AiCallRecord) => void | Promise<void>;
  config?: AiConfig;
};

export type StructuredResult<T> = { data: T; inputTokens: number; outputTokens: number; model: string; provider: string };

export class AiFailedError extends Error {
  constructor(
    message: string,
    public readonly kind: "no_key" | "schema" | "refusal" | "truncated" | "too_large" | "rate_limited" | "provider",
  ) {
    super(message);
  }
}

type RawReply = { text: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; model: string };

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
export const estimateTokens = (s: string) => Math.ceil(s.length / 3.6);

const GROQ_STRICT_MODELS = new Set(["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Anthropic ----------

let anthropicClient: Anthropic | null = null;

/** Number of nullable / union-typed fields in a JSON schema (Anthropic structured outputs allow at most 16). */
export function countUnions(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((n: number, x) => n + countUnions(x), 0);
  if (!node || typeof node !== "object") return 0;
  const o = node as Record<string, unknown>;
  const self = Array.isArray(o.anyOf) || Array.isArray(o.type) ? 1 : 0;
  return self + Object.values(o).reduce((n: number, v) => n + countUnions(v), 0);
}

export const ANTHROPIC_UNION_LIMIT = 16;

async function callAnthropic(cfg: AiConfig, system: string, user: string, schema: object, maxTokens: number): Promise<RawReply> {
  anthropicClient ??= new Anthropic({ apiKey: cfg.apiKey ?? undefined, maxRetries: 3 });
  // Schemas within the union limit use structured outputs (decoding constrained to the schema). Larger ones
  // (the extraction schema) go in the prompt and are validated by zod in callStructured, as with Groq.
  const constrained = countUnions(schema) <= ANTHROPIC_UNION_LIMIT;
  const systemText = constrained
    ? system
    : `${system}\n\nReply with one JSON object only (no prose, no code fences) containing every key of this JSON Schema; use [] for empty lists and null for unknown values:\n${JSON.stringify(schema)}`;
  let response;
  try {
    // Streamed: Opus 5.5 always thinks and its reasoning counts toward max_tokens, so the limits are large;
    // streaming avoids HTTP timeouts on long replies (finalMessage() collects the whole response).
    response = await anthropicClient.beta.messages.stream({
      model: cfg.model,
      max_tokens: maxTokens,
      // Rules first and stable, so repeated calls in a review read them from the prompt cache.
      system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      output_config: constrained
        ? { effort: cfg.effort, format: { type: "json_schema", schema: schema as Record<string, unknown> } }
        : { effort: cfg.effort },
      // If a safety classifier declines, the API re-runs the request on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    }).finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new AiFailedError("The AI provider is rate-limiting requests. Try again in a minute.", "rate_limited");
    if (err instanceof Anthropic.AuthenticationError) throw new AiFailedError("The Anthropic API key was rejected.", "no_key");
    if (err instanceof Anthropic.APIError) throw new AiFailedError(`Anthropic API error ${err.status ?? ""}: ${err.message}`, "provider");
    throw err;
  }
  if (response.stop_reason === "refusal") throw new AiFailedError("The AI declined to process this document.", "refusal");
  if (response.stop_reason === "max_tokens") throw new AiFailedError("The AI reply was cut off (output limit).", "truncated");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return {
    text,
    inputTokens: (response.usage.input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    model: response.model,
  };
}

// ---------- Groq (OpenAI-compatible chat completions) ----------

type GroqResponse = {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string; code?: string; type?: string };
};

// Groq reports its per-minute token budget on every response; pace requests before hitting a 429.
const groqWindow = { remainingTokens: Infinity, resetAt: 0 };

/** "697ms" | "7.66s" | "1m2.3s" → milliseconds */
export function parseGroqDuration(v: string | null): number {
  if (!v) return 0;
  let ms = 0;
  for (const [, n, unit] of v.matchAll(/([\d.]+)(ms|s|m|h)/g)) ms += +n * ({ ms: 1, s: 1000, m: 60_000, h: 3_600_000 } as const)[unit as "ms"];
  return Math.ceil(ms);
}

async function paceGroq(estimated: number): Promise<void> {
  const now = Date.now();
  if (now >= groqWindow.resetAt) return;
  if (estimated > groqWindow.remainingTokens) await sleep(groqWindow.resetAt - now + 300);
}

/** Groq's token count runs higher than ~3.6 chars/token; be conservative so requests are never rejected. */
export const groqPromptTokens = (s: string) => Math.ceil(s.length / 3.1);
const GROQ_TPM = () => Number(process.env.GROQ_TPM) || 8000;

async function callGroq(cfg: AiConfig, system: string, user: string, schema: object, schemaName: string, requestedMax: number): Promise<RawReply> {
  // Groq's "strict" json_schema on gpt-oss rejects replies that reorder keys or drop an empty list, failing the
  // whole call. JSON mode + the schema in the prompt + fillDefaults + zod validation is more reliable.
  // Set GROQ_STRICT=1 to opt back into strict mode on models that support it.
  const strict = process.env.GROQ_STRICT === "1" && GROQ_STRICT_MODELS.has(cfg.model);
  // Groq counts prompt + max_completion_tokens against the per-minute limit, so size the output to fit.
  // The response schema counts towards the request size too.
  const promptTokens = groqPromptTokens(system + user + JSON.stringify(schema)) + 60;
  const maxTokens = Math.min(requestedMax, GROQ_TPM() - promptTokens - 150);
  if (maxTokens < Math.min(1500, requestedMax)) {
    throw new AiFailedError(
      `This part of the contract (~${promptTokens} tokens) leaves too little room for the reply within Groq's ${GROQ_TPM()} tokens/minute. Lower AI_MAX_INPUT_TOKENS or use a higher Groq tier.`,
      "too_large",
    );
  }
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [
      {
        role: "system",
        content: strict
          ? system
          : `${system}\n\nReply with one compact JSON object (no indentation) containing every key of this JSON Schema, in order; use [] for empty lists and null for unknown values:\n${JSON.stringify(schema)}`,
      },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    max_completion_tokens: maxTokens,
  };
  // Server-side JSON enforcement on gpt-oss fails whole calls (400 "Failed to generate JSON") instead of returning
  // something we can repair, so by default the reply is parsed and validated here (GROQ_JSON_MODE=json_object to change).
  if (strict) body.response_format = { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } };
  else if (process.env.GROQ_JSON_MODE === "json_object") body.response_format = { type: "json_object" };
  if (cfg.model.startsWith("openai/gpt-oss")) body.reasoning_effort = cfg.effort === "low" || cfg.effort === "medium" ? cfg.effort : "high";

  // Free-tier limits are per minute: wait out 429s using the retry-after header (bounded).
  for (let wait = 0; ; wait++) {
    await paceGroq(promptTokens + maxTokens);
    // Connection resets and timeouts happen; retry those (not HTTP errors) twice with backoff.
    let res: Response | null = null;
    for (let net = 0; !res; net++) {
      try {
        res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (err) {
        if (net >= 2) {
          throw new AiFailedError(`Could not reach Groq (network error: ${err instanceof Error ? err.message : String(err)}). Try again in a minute.`, "provider");
        }
        await sleep(net === 0 ? 2000 : 6000);
      }
    }
    const remaining = Number(res.headers.get("x-ratelimit-remaining-tokens"));
    if (Number.isFinite(remaining)) {
      groqWindow.remainingTokens = remaining;
      groqWindow.resetAt = Date.now() + parseGroqDuration(res.headers.get("x-ratelimit-reset-tokens"));
    }
    const json = (await res.json().catch(() => ({}))) as GroqResponse;
    if (res.status === 401) throw new AiFailedError("The Groq API key was rejected.", "no_key");
    if (res.status === 413 || /request too large/i.test(json.error?.message ?? "")) {
      throw new AiFailedError(
        `This request is larger than the Groq plan allows per minute. Lower AI_MAX_INPUT_TOKENS or use a higher Groq tier. (${json.error?.message ?? res.status})`,
        "too_large",
      );
    }
    if (res.status === 429) {
      const msg = json.error?.message ?? "";
      if (/per day|\bTPD\b|\bRPD\b/i.test(msg)) {
        throw new AiFailedError("Groq's daily limit for this key is used up. Reviews can continue tomorrow, or with a higher Groq tier / an Anthropic key.", "rate_limited");
      }
      // retry-after is often a few seconds, but a large request needs the token window to refill: wait for the reset.
      const retryAfterMs = (Number(res.headers.get("retry-after")) || 2) * 1000;
      const resetMs = parseGroqDuration(res.headers.get("x-ratelimit-reset-tokens"));
      if (wait >= 8) throw new AiFailedError("Groq kept rate-limiting the review. Try again in a few minutes.", "rate_limited");
      await sleep(Math.min(65_000, Math.max(retryAfterMs, resetMs) + 500));
      continue;
    }
    if (!res.ok) {
      // Best-effort JSON mode can fail with 400 "does not match the expected schema": count it as a schema failure.
      const kind = res.status === 400 && /schema|json/i.test(json.error?.message ?? "") ? "schema" : "provider";
      throw new AiFailedError(`Groq API error ${res.status}: ${json.error?.message ?? "unknown error"}`, kind);
    }
    const choice = json.choices?.[0];
    if (choice?.finish_reason === "length") throw new AiFailedError("The AI reply was cut off (output limit).", "truncated");
    return {
      text: choice?.message?.content ?? "",
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      cacheReadTokens: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      model: json.model ?? cfg.model,
    };
  }
}

// ---------- Shared ----------

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    // Text before/after the object (no server-side JSON mode): take the outermost {...}.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no JSON object");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function summariseZod(err: z.ZodError): string {
  return err.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

export async function callStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
  const cfg = call.config ?? aiConfig();
  if (!cfg.apiKey) {
    throw new AiFailedError(
      cfg.provider === "anthropic" ? "ANTHROPIC_API_KEY is not set." : "GROQ_API_KEY is not set.",
      "no_key",
    );
  }
  assertStrictCompatible(call.schema);
  const schema = toStrictJsonSchema(call.schema, { compactNullable: cfg.provider === "groq" });

  let user = call.user;
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    // G2: the guard sees exactly what will be sent.
    call.guard(call.system);
    call.guard(user);
    const started = Date.now();
    const record = (r: Partial<RawReply>, ok: boolean, error: string | null) =>
      call.onCall?.({
        step: call.step,
        provider: cfg.provider,
        model: r.model ?? cfg.model,
        maskedPromptHash: sha256(`${call.system}\n${user}`),
        inputTokens: r.inputTokens ?? 0,
        outputTokens: r.outputTokens ?? 0,
        cacheReadTokens: r.cacheReadTokens ?? 0,
        ms: Date.now() - started,
        attempt,
        ok,
        error,
      });

    let reply: RawReply;
    try {
      reply =
        cfg.provider === "anthropic"
          ? await callAnthropic(cfg, call.system, user, schema, call.maxTokens)
          : await callGroq(cfg, call.system, user, schema, call.schemaName, call.maxTokens);
    } catch (err) {
      const e = err instanceof AiFailedError ? err : new AiFailedError(err instanceof Error ? err.message : String(err), "provider");
      await record({}, false, e.message);
      // Only a schema/format failure is worth a second attempt; key, size and refusal errors are not.
      if ((e.kind === "schema" || e.kind === "truncated") && attempt === 1) {
        lastError = e.message;
        continue;
      }
      throw e;
    }

    let parsed: unknown;
    try {
      parsed = parseJson(reply.text);
    } catch {
      lastError = "The reply was not valid JSON.";
      await record(reply, false, lastError);
      user = `${call.user}\n\nYour previous reply was not valid JSON. Reply with one JSON object only.`;
      continue;
    }
    const result = call.schema.safeParse(fillDefaults(schema, parsed));
    if (!result.success) {
      lastError = summariseZod(result.error);
      await record(reply, false, `schema: ${lastError}`);
      user = `${call.user}\n\nYour previous reply did not match the required format (${lastError}). Reply again with every field present.`;
      continue;
    }
    await record(reply, true, null);
    return { data: result.data, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, model: reply.model, provider: cfg.provider };
  }
  // G10: fail closed.
  throw new AiFailedError(`Review failed — review manually. The AI reply did not match the required format twice (${lastError}).`, "schema");
}
