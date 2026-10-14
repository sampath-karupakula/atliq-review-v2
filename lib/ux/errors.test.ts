import { describe, expect, it } from "vitest";
import { friendlyError } from "./errors";

describe("friendlyError", () => {
  it("explains a masking leak without the detector jargon", () => {
    const e = friendlyError("Masking leak: 2 item(s) would have reached the AI (dictionary, masked_original). The AI call was blocked.");
    expect(e.kind).toBe("leak");
    expect(e.title).not.toMatch(/dictionary|masked_original/);
    expect(e.next).toMatch(/Nothing reached the AI/);
  });
  it("classifies provider failures", () => {
    expect(friendlyError("The AI provider is rate-limiting requests. Try again in a minute.").kind).toBe("rate");
    expect(friendlyError("Groq's daily limit for this key is used up.").kind).toBe("daily");
    expect(friendlyError("Review failed — review manually. (fetch failed)").kind).toBe("network");
    expect(friendlyError("Review failed — review manually. The AI reply did not match the required format twice (x).").kind).toBe("format");
    expect(friendlyError("Anthropic API error 400: {\"type\":\"error\"}").kind).toBe("other");
    expect(friendlyError("Anthropic API error : Connection error.").kind).toBe("network");
  });
  it("keeps the raw message for the details disclosure", () => {
    expect(friendlyError("fetch failed").raw).toBe("fetch failed");
    expect(friendlyError(null).raw).toBe("Unknown error.");
  });
});
