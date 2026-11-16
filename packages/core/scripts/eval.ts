/* Golden-set eval for the rules classifier. Usage: pnpm eval */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateRules, type GoldenItem } from "../src/classify/eval";

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "test", "golden.json"), "utf8"),
) as GoldenItem[];
const r = evaluateRules(golden);
const pct = (n: number | null) => (n === null ? "  n/a" : `${(n * 100).toFixed(0).padStart(4)}%`);

console.log(`\nOppRadar rules classifier, golden set (${r.total} headlines)\n`);
console.log("event type            precision  correct/predicted  support");
for (const t of r.per_type) {
  console.log(
    `${t.type.padEnd(22)}${pct(t.precision).padStart(9)}  ${`${t.correct}/${t.predicted}`.padStart(17)}  ${String(t.support).padStart(7)}`,
  );
}
console.log(
  `\nevent_type accuracy: ${pct(r.event_accuracy)}   company accuracy: ${pct(r.company_accuracy)}`,
);
if (r.misses.length) {
  console.log("\nmisses:");
  for (const m of r.misses) console.log(`  - [${m.expected} -> ${m.got}] ${m.title}`);
}
const ok = r.event_accuracy >= 0.7;
console.log(ok ? "\nPASS (>= 70% required)\n" : "\nFAIL (< 70%)\n");
process.exit(ok ? 0 : 1);
