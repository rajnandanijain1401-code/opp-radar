---
description: Run OppRadar now with Claude as the classifier (fetch, classify, email)
---

Use the `opp-radar` skill to run the radar end to end:

1. `pnpm radar fetch --json --since-state`, then read `out/candidates.json`.
2. Classify every candidate into the Signal schema from the skill and write `out/classified.json`.
3. `pnpm radar send --input out/classified.json $ARGUMENTS`
4. Summarize what was found and what was emailed.

Pass `--force-digest` as an argument to send the digest immediately.
