import { EVENT_TYPES, type EventType } from "../schemas";
import { companyKey } from "../dedupe/cluster";
import { classifyWithRules } from "./rules";

export interface GoldenItem {
  title: string;
  event_type: EventType;
  company_name: string;
  snippet?: string;
}

export interface EvalReport {
  total: number;
  event_accuracy: number;
  company_accuracy: number;
  per_type: {
    type: EventType;
    predicted: number;
    correct: number;
    precision: number | null;
    support: number;
  }[];
  misses: { title: string; expected: EventType; got: EventType }[];
}

/** Evaluate the rules classifier on a labeled golden set: precision per event type + overall accuracy. */
export function evaluateRules(golden: GoldenItem[]): EvalReport {
  const preds = golden.map((g, i) => ({
    g,
    p: classifyWithRules({
      content_hash: String(i),
      title: g.title,
      snippet: g.snippet,
      source_id: "golden",
    }),
  }));
  const per_type = EVENT_TYPES.map((type) => {
    const predicted = preds.filter((x) => x.p.event_type === type);
    const correct = predicted.filter((x) => x.g.event_type === type).length;
    return {
      type,
      predicted: predicted.length,
      correct,
      precision: predicted.length ? correct / predicted.length : null,
      support: golden.filter((g) => g.event_type === type).length,
    };
  });
  const eventCorrect = preds.filter((x) => x.p.event_type === x.g.event_type).length;
  const companyCorrect = preds.filter(
    (x) => companyKey(x.p.company_name) === companyKey(x.g.company_name),
  ).length;
  return {
    total: golden.length,
    event_accuracy: eventCorrect / golden.length,
    company_accuracy: companyCorrect / golden.length,
    per_type,
    misses: preds
      .filter((x) => x.p.event_type !== x.g.event_type)
      .map((x) => ({ title: x.g.title, expected: x.g.event_type, got: x.p.event_type })),
  };
}
