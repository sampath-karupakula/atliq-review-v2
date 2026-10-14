import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiFailedError, callStructured, type AiCallRecord } from "./client";
import { toStrictJsonSchema, assertStrictCompatible } from "./jsonSchema";
import type { AiConfig } from "@/lib/config";

const GROQ: AiConfig = { provider: "groq", model: "openai/gpt-oss-120b", apiKey: "test-key", effort: "high", maxInputTokens: 6000 };
const Schema = z.object({ title: z.string(), clause: z.string().nullable(), items: z.array(z.object({ n: z.number() })) });

function groqReply(content: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(
    JSON.stringify(
      status === 200
        ? { model: "openai/gpt-oss-120b", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 20 } }
        : { error: { message: content } },
    ),
    { status, headers: { "content-type": "application/json", ...headers } },
  );
}

const base = { step: "test", system: "rules", user: "<contract>CLIENT_A pays</contract>", schemaName: "t", schema: Schema, maxTokens: 500, config: GROQ };

afterEach(() => vi.unstubAllGlobals());

describe("strict JSON schema", () => {
  it("adds additionalProperties:false and requires every key", () => {
    const js = toStrictJsonSchema(Schema) as { additionalProperties: boolean; required: string[]; properties: Record<string, unknown> };
    expect(js.additionalProperties).toBe(false);
    expect(js.required).toEqual(["title", "clause", "items"]);
    expect(JSON.stringify(js)).not.toContain("$schema");
  });
  it("rejects optional fields", () => {
    expect(() => assertStrictCompatible(z.object({ a: z.string().optional() }))).toThrow(/nullable/);
  });
});

describe("Anthropic structured-output limit", () => {
  it("counts nullable fields; the extraction schema is over the limit, scan/clash/bundle are within it", async () => {
    const { countUnions, ANTHROPIC_UNION_LIMIT } = await import("./client");
    const { ExtractSchema, ScanSchema, ClashSchema, BundleSchema, SummarySchema } = await import("./schemas");
    expect(countUnions(toStrictJsonSchema(ExtractSchema))).toBeGreaterThan(ANTHROPIC_UNION_LIMIT);
    for (const s of [ScanSchema, ClashSchema, BundleSchema, SummarySchema]) expect(countUnions(toStrictJsonSchema(s))).toBeLessThanOrEqual(ANTHROPIC_UNION_LIMIT);
  });
});

describe("callStructured with Groq", () => {
  it("sends JSON mode with the schema in the prompt and returns validated data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(groqReply(JSON.stringify({ title: "x", clause: null, items: [{ n: 1 }] })));
    vi.stubGlobal("fetch", fetchMock);
    const records: AiCallRecord[] = [];
    const out = await callStructured({ ...base, guard: () => {}, onCall: (r) => void records.push(r) });
    expect(out.data).toEqual({ title: "x", clause: null, items: [{ n: 1 }] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toBeUndefined();
    expect(body.messages[0].content).toContain('"additionalProperties":false');
    expect(body.reasoning_effort).toBe("high");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ ok: true, provider: "groq", inputTokens: 100 });
    expect(records[0].maskedPromptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(records)).not.toContain("CLIENT_A pays");
  });

  it("runs the leak guard before sending and never calls the API if it throws", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      callStructured({ ...base, guard: () => { throw new Error("Masking leak"); } }),
    ).rejects.toThrow("Masking leak");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fills a dropped empty list or null instead of failing, but never a required string", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(groqReply(JSON.stringify({ title: "x" }))));
    const out = await callStructured({ ...base, guard: () => {} });
    expect(out.data).toEqual({ title: "x", clause: null, items: [] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(groqReply(JSON.stringify({ clause: "1.1", items: [] }))));
    await expect(callStructured({ ...base, guard: () => {} })).rejects.toMatchObject({ kind: "schema" });
  });

  it("retries once on a schema mismatch, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(groqReply(JSON.stringify({ clause: "1.1" })))
      .mockResolvedValueOnce(groqReply(JSON.stringify({ title: "x", clause: "1.1", items: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const out = await callStructured({ ...base, guard: () => {} });
    expect(out.data.clause).toBe("1.1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages[1].content).toMatch(/did not match the required format/);
  });

  it("fails closed after two bad replies (G10)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(groqReply("not json at all")));
    await expect(callStructured({ ...base, guard: () => {} })).rejects.toMatchObject({ kind: "schema", message: expect.stringMatching(/Review failed — review manually/) });
  });

  it("waits out a 429 using retry-after", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(groqReply("rate limited", 429, { "retry-after": "0.01" }))
      .mockResolvedValueOnce(groqReply(JSON.stringify({ title: "ok", clause: null, items: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const out = await callStructured({ ...base, guard: () => {} });
    expect(out.data.title).toBe("ok");
  });

  it("retries a dropped connection, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(groqReply(JSON.stringify({ title: "ok", clause: null, items: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const out = await callStructured({ ...base, guard: () => {} });
    expect(out.data.title).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("reports a request too large for the plan clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(groqReply("Request too large for model on tokens per minute (TPM)", 413)));
    await expect(callStructured({ ...base, guard: () => {} })).rejects.toMatchObject({ kind: "too_large" });
  });

  it("uses JSON object mode with the schema in the prompt for non-strict models", async () => {
    const fetchMock = vi.fn().mockResolvedValue(groqReply(JSON.stringify({ title: "x", clause: null, items: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await callStructured({ ...base, config: { ...GROQ, model: "llama-3.3-70b-versatile" }, guard: () => {} });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toBeUndefined();
    expect(body.messages[0].content).toContain("JSON Schema");
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("refuses to run without a key", async () => {
    await expect(callStructured({ ...base, config: { ...GROQ, apiKey: null }, guard: () => {} })).rejects.toBeInstanceOf(AiFailedError);
  });
});
