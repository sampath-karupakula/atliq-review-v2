// Runtime configuration from environment variables. Secrets live only in .env.local / Vercel env vars.

export const DEFAULT_TODAY = "2026-09-28";

// The dataset's "today". All live/expired date maths uses this, never the wall clock.
export function appToday(): string {
  const v = process.env.APP_TODAY?.trim();
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : DEFAULT_TODAY;
}

/** A real timestamp placed on the app's calendar: shifted by the gap between APP_TODAY and the real date, so a
 * question asked and answered today lines up with answer-by dates that are set against APP_TODAY. */
export function toAppDay(d: Date, now = new Date()): string {
  const realToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const offset = Date.parse(appToday() + "T00:00:00Z") - realToday;
  return new Date(d.getTime() + offset).toISOString().slice(0, 10);
}

export type AiProvider = "anthropic" | "groq";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type AiConfig = {
  provider: AiProvider;
  model: string;
  apiKey: string | null;
  /** Reasoning effort. Anthropic: output_config.effort. Groq gpt-oss: reasoning_effort (low/medium/high). */
  effort: Effort;
  /**
   * Largest prompt (in estimated tokens) sent in one request. Long contracts are split into clause groups
   * below this size. Groq's free tier allows ~8K tokens per minute on gpt-oss-120b, so its default is small.
   */
  maxInputTokens: number;
};

const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-opus-5-5",
  groq: "openai/gpt-oss-120b",
};

const DEFAULT_MAX_INPUT: Record<AiProvider, number> = {
  anthropic: 150_000,
  groq: 5_000,
};

const env = (k: string) => process.env[k]?.trim() || null;
/** GROQ_API_KEY is the documented name; GROQ_KEY is accepted as an alias. */
const groqKey = () => env("GROQ_API_KEY") ?? env("GROQ_KEY");

/**
 * Provider choice: LLM_PROVIDER if set; otherwise Anthropic when its key is present, else Groq when its key is
 * present, else Anthropic (and calls fail with a clear "key not set" message).
 */
export function aiConfig(): AiConfig {
  const explicit = env("LLM_PROVIDER")?.toLowerCase();
  const provider: AiProvider =
    explicit === "groq" || explicit === "anthropic"
      ? explicit
      : env("ANTHROPIC_API_KEY")
        ? "anthropic"
        : groqKey()
          ? "groq"
          : "anthropic";
  const model = (provider === "anthropic" ? env("ANTHROPIC_MODEL") : env("GROQ_MODEL")) ?? DEFAULT_MODEL[provider];
  const effortRaw = env("AI_EFFORT")?.toLowerCase();
  const effort: Effort = (["low", "medium", "high", "xhigh", "max"] as const).find((e) => e === effortRaw) ?? "high";
  const maxIn = Number(env("AI_MAX_INPUT_TOKENS"));
  return {
    provider,
    model,
    apiKey: provider === "anthropic" ? env("ANTHROPIC_API_KEY") : groqKey(),
    effort,
    maxInputTokens: Number.isFinite(maxIn) && maxIn > 1000 ? maxIn : DEFAULT_MAX_INPUT[provider],
  };
}

/** @deprecated use aiConfig().model */
export function anthropicModel(): string {
  return env("ANTHROPIC_MODEL") ?? DEFAULT_MODEL.anthropic;
}

/** Contracts whose deadline is within this many days are "due soon": the queue's bulk review covers only these,
 * and starting a review on a contract due later asks for confirmation (no tokens spent on far-off contracts). */
export function reviewHorizonDays(): number {
  const n = Number(process.env.REVIEW_HORIZON_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 14;
}
