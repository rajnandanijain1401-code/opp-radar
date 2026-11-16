import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EVENT_TYPES, ROLE_FAMILIES } from "../schemas";
import { buildUserMessage, CLASSIFY_SYSTEM_PROMPT, type PromptItem } from "./prompt";

export const DEFAULT_MODEL = "claude-haiku-5-5";

/**
 * Wire schema sent to the API as structured output. Deliberately lenient (no length limits):
 * every item is re-validated against the strict ClassificationSchema afterwards.
 */
export const LlmItemSchema = z.object({
  content_hash: z.string(),
  company_name: z.string(),
  company_domain: z.string().nullable(),
  event_type: z.enum(EVENT_TYPES),
  amount_usd: z.number().nullable(),
  round: z.string().nullable(),
  investors: z.array(z.string()),
  geographies: z.array(z.string()),
  sectors: z.array(z.string()),
  roles_likely: z.array(z.enum(ROLE_FAMILIES)),
  hiring_likelihood: z.number(),
  hiring_reason: z.string(),
  summary: z.string(),
  suggested_action: z.string(),
  outreach_opener: z.string(),
  confidence: z.number(),
});
export const LlmBatchSchema = z.object({ items: z.array(LlmItemSchema) });
export type LlmBatch = z.infer<typeof LlmBatchSchema>;

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface LlmClassifier {
  model: string;
  /** Returns parsed output, or null when the model output did not match the schema. */
  classifyBatch(items: PromptItem[]): Promise<{ output: LlmBatch | null; usage: LlmUsage }>;
}

/** Minimal shape of the SDK we use, so tests can inject a mock. */
export interface MessagesParseLike {
  messages: {
    parse(params: Record<string, unknown>): Promise<{
      parsed_output: unknown;
      stop_reason?: string | null;
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export function createAnthropicClassifier(opts: {
  apiKey?: string;
  model?: string;
  client?: MessagesParseLike;
}): LlmClassifier {
  const model = opts.model || DEFAULT_MODEL;
  const client: MessagesParseLike =
    opts.client ??
    (new Anthropic({ apiKey: opts.apiKey, maxRetries: 2 }) as unknown as MessagesParseLike);
  return {
    model,
    async classifyBatch(items) {
      const res = await client.messages.parse({
        model,
        max_tokens: 16000,
        system: CLASSIFY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(items) }],
        output_config: { effort: "low", format: zodOutputFormat(LlmBatchSchema) },
      });
      const usage = {
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
      };
      if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens")
        return { output: null, usage };
      const parsed = LlmBatchSchema.safeParse(res.parsed_output);
      return { output: parsed.success ? parsed.data : null, usage };
    },
  };
}
