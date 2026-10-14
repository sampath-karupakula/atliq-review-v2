import { describe, expect, it } from "vitest";
import { topicOf } from "./topics";

describe("topicOf", () => {
  it("groups by plain topic", () => {
    expect(topicOf({ check: "clash", category: "exclusivity" })).toBe("Clashes with past promises");
    expect(topicOf({ check: "deal_value", category: "delay_penalty" })).toBe("Penalties");
    expect(topicOf({ check: "full_read", category: "insurance" })).toBe("Liability and insurance");
    expect(topicOf({ check: "pass_down", category: "ip" })).toBe("Documents in this deal");
    expect(topicOf({ check: "entity_law", category: null })).toBe("Company and law");
    expect(topicOf({ check: "full_read", category: "other" })).toBe("Other");
  });
});
