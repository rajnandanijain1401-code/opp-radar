import { describe, expect, it, vi } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  classifyCandidates,
  createMemoryCache,
  createTokenBudget,
  sanitizeClassification,
} from "../../src/classify/classify";
import {
  createAnthropicClassifier,
  DEFAULT_MODEL,
  LlmBatchSchema,
  type MessagesParseLike,
} from "../../src/classify/llm";
import { CLASSIFY_SYSTEM_PROMPT } from "../../src/classify/prompt";
import type { Candidate } from "../../src/schemas";

const cand = (hash: string, title: string): Candidate => ({
  content_hash: hash,
  canonical_url: `https://x.com/${hash}`,
  source_id: "inc42",
  source_name: "Inc42",
  source_quality: 80,
  title,
  published_at: "2026-11-16T10:00:00.000Z",
  fetched_at: "2026-11-16T12:00:00.000Z",
  other_sources: [],
});

const llmItem = (hash: string, extra: Record<string, unknown> = {}) => ({
  content_hash: hash,
  company_name: "Zeta Pay",
  company_domain: null,
  event_type: "funding",
  amount_usd: 20000000,
  round: "Series B",
  investors: ["Northstar Ventures"],
  geographies: ["India"],
  sectors: ["fintech"],
  roles_likely: ["engineering", "sales"],
  hiring_likelihood: 84.4,
  hiring_reason: "New Series B money usually funds engineering and sales hiring.",
  summary:
    "Zeta Pay closed a $20M Series B. It plans to grow its lending product. A third sentence that must be cut.",
  suggested_action: "Reach out to the engineering lead this week.",
  outreach_opener: "Congrats on the Series B — exciting times!",
  confidence: 0.9,
  ...extra,
});

function mockClient(
  responses: unknown[],
): MessagesParseLike & { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    messages: {
      parse: vi.fn(async (params: Record<string, unknown>) => {
        calls.push(params);
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return {
          parsed_output: next,
          stop_reason: "end_turn",
          usage: { input_tokens: 1000, output_tokens: 400 },
        };
      }),
    },
  };
}

describe("LLM classifier (mocked Anthropic client)", () => {
  it("builds a valid structured-output format from the wire schema", () => {
    expect(() => zodOutputFormat(LlmBatchSchema)).not.toThrow();
  });

  it("sends the system prompt, default Haiku model and low effort", async () => {
    const client = mockClient([{ items: [llmItem("a")] }]);
    const llm = createAnthropicClassifier({ client });
    const res = await classifyCandidates([cand("a", "Zeta Pay raises $20 Mn")], {
      mode: "llm",
      llm,
    });
    expect(client.calls[0]).toMatchObject({ model: DEFAULT_MODEL, system: CLASSIFY_SYSTEM_PROMPT });
    expect((client.calls[0]!.output_config as { effort: string }).effort).toBe("low");
    const item = res.items[0]!;
    expect(item.classifier).toBe("llm");
    expect(item.hiring_likelihood).toBe(84);
    expect(item.summary.split(/(?<=[.!?])\s+/)).toHaveLength(2);
    expect(item.outreach_opener).not.toContain("—");
  });

  it("retries invalid JSON once, then succeeds", async () => {
    const client = mockClient([null, { items: [llmItem("a")] }]);
    const res = await classifyCandidates([cand("a", "Zeta Pay raises $20 Mn")], {
      mode: "llm",
      llm: createAnthropicClassifier({ client }),
    });
    expect(client.calls).toHaveLength(2);
    expect(res.items[0]!.classifier).toBe("llm");
  });

  it("falls back to rules after a second invalid response or an API error", async () => {
    const client = mockClient([{ items: [{ bad: true }] }, new Error("overloaded")]);
    const res = await classifyCandidates([cand("a", "Orbit Health acquires Lumen Labs")], {
      mode: "llm",
      llm: createAnthropicClassifier({ client }),
    });
    expect(res.items[0]).toMatchObject({
      classifier: "rules",
      event_type: "acquisition",
      company_name: "Orbit Health",
    });
    expect(res.stats.fallbacks).toBe(1);
  });

  it("batches up to 20 items per call and fills missing items with rules", async () => {
    const cands = Array.from({ length: 25 }, (_, i) =>
      cand(`h${i}`, `Company${i} raises $5M seed`),
    );
    const first = { items: cands.slice(0, 19).map((c) => llmItem(c.content_hash)) }; // one missing
    const second = { items: cands.slice(20).map((c) => llmItem(c.content_hash)) };
    const client = mockClient([first, second]);
    const res = await classifyCandidates(cands, {
      mode: "llm",
      llm: createAnthropicClassifier({ client }),
    });
    expect(client.calls).toHaveLength(2);
    expect(res.stats).toMatchObject({
      llm: 24,
      rules: 1,
      fallbacks: 1,
      llm_calls: 2,
      input_tokens: 2000,
    });
  });

  it("uses the cache so each item is classified once globally", async () => {
    const cache = createMemoryCache();
    const client = mockClient([{ items: [llmItem("a")] }]);
    const llm = createAnthropicClassifier({ client });
    await classifyCandidates([cand("a", "Zeta Pay raises $20 Mn")], { mode: "llm", llm, cache });
    const again = await classifyCandidates([cand("a", "Zeta Pay raises $20 Mn")], {
      mode: "llm",
      llm,
      cache,
    });
    expect(client.calls).toHaveLength(1);
    expect(again.stats.cached).toBe(1);
  });

  it("switches to rules when the daily token budget is exhausted", async () => {
    const client = mockClient([{ items: [llmItem("a")] }]);
    const budget = createTokenBudget(2000, 1900);
    const res = await classifyCandidates([cand("a", "Zeta Pay raises $20 Mn")], {
      mode: "llm",
      llm: createAnthropicClassifier({ client }),
      budget,
    });
    expect(client.calls).toHaveLength(0);
    expect(res.stats.budget_exceeded).toBe(true);
    expect(res.items[0]!.classifier).toBe("rules");
  });

  it("rules mode never calls the API", async () => {
    const client = mockClient([]);
    const res = await classifyCandidates([cand("a", "Zeta Pay raises $20 Mn")], {
      mode: "rules",
      llm: createAnthropicClassifier({ client }),
    });
    expect(client.calls).toHaveLength(0);
    expect(res.items[0]!.event_type).toBe("funding");
  });

  it("sanitize rejects unknown event types", () => {
    expect(sanitizeClassification(llmItem("a", { event_type: "party" }))).toBeNull();
  });

  it("prompt instructs own-words summaries and the other fallback", () => {
    expect(CLASSIFY_SYSTEM_PROMPT).toMatch(/own words/);
    expect(CLASSIFY_SYSTEM_PROMPT).toMatch(/Never copy/);
    expect(CLASSIFY_SYSTEM_PROMPT).toMatch(/"other" with confidence below 0.4/);
    expect(CLASSIFY_SYSTEM_PROMPT).not.toContain("—");
  });
});
