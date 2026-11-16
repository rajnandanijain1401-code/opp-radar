import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SignalInputSchema } from "@opp-radar/core";

const ROOT = resolve(__dirname, "..", "..", "..");

describe("Claude mode skill", () => {
  const skill = readFileSync(resolve(ROOT, ".claude/skills/opp-radar/SKILL.md"), "utf8");

  it("has name and description frontmatter", () => {
    expect(skill).toMatch(/^---\nname: opp-radar\ndescription: .+\n---/);
  });

  it("ships an example that validates against the Signal input schema", () => {
    const block = skill.split("<!-- example:start -->")[1]!.split("<!-- example:end -->")[0]!;
    const json = block.replace(/```json|```/g, "");
    expect(SignalInputSchema.safeParse(JSON.parse(json)).success).toBe(true);
  });

  it("documents the exact CLI commands", () => {
    expect(skill).toContain("pnpm radar fetch --json --since-state");
    expect(skill).toContain("pnpm radar send --input out/classified.json");
    const cmd = readFileSync(resolve(ROOT, ".claude/commands/radar.md"), "utf8");
    expect(cmd).toContain("opp-radar");
  });

  it("contains no em dashes", () => {
    for (const f of [
      ".claude/skills/opp-radar/SKILL.md",
      ".claude/commands/radar.md",
      "docs/claude-mode.md",
    ]) {
      expect(readFileSync(resolve(ROOT, f), "utf8"), f).not.toMatch(/\u2014/);
    }
  });
});
