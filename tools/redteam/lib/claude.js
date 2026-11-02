import Anthropic from "@anthropic-ai/sdk";

// USD per million tokens. Cache writes bill at 1.25x input, reads at the listed rate.
const PRICING = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01 },
};

export const client = new Anthropic({ maxRetries: 4 });

const spend = { usd: 0, calls: 0, unpriced: new Set() };

export function trackUsage(model, usage) {
  spend.calls++;
  const p = PRICING[model];
  if (!p || !usage) {
    spend.unpriced.add(model);
    return;
  }
  const m = 1e6;
  spend.usd +=
    ((usage.input_tokens ?? 0) * p.in) / m +
    ((usage.cache_creation_input_tokens ?? 0) * p.in * 1.25) / m +
    ((usage.cache_read_input_tokens ?? 0) * p.cacheRead) / m +
    ((usage.output_tokens ?? 0) * p.out) / m;
}

export function getSpend() {
  return { usd: Number(spend.usd.toFixed(4)), calls: spend.calls, unpriced: [...spend.unpriced] };
}

export function textOf(response) {
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// Call used for the attacker and judge. Server-side fallbacks are on so a
// safety-classifier decline is retried on another model rather than lost.
export async function call({ model, system, messages, effort = "medium", maxTokens = 16000, schema }) {
  const output_config = { effort };
  if (schema) output_config.format = { type: "json_schema", schema };
  const response = await client.beta.messages.create({
    model,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages,
    output_config,
  });
  trackUsage(model, response.usage);
  if (response.stop_reason === "refusal") {
    const err = new Error(`Model declined (${response.stop_details?.category ?? "unknown"})`);
    err.refusal = true;
    throw err;
  }
  return response;
}
