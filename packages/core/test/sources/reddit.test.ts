import { describe, expect, it } from "vitest";
import { createRedditAdapter } from "../../src/sources/reddit";
import { createFixtureHttpClient } from "../../src/http/fixtures";
import { SourceBlockedError } from "../../src/sources/types";
import { DAY_AGO, fixtureCtx } from "../helpers";

const def = {
  id: "reddit",
  kind: "reddit" as const,
  name: "Reddit",
  subreddits: ["startups"],
  quality: 40,
  enabled: true,
};

describe("reddit adapter", () => {
  it("parses listings and skips stickied posts", async () => {
    const items = await createRedditAdapter(def, fixtureCtx()).fetch(DAY_AGO);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source_name: "r/startups" });
    expect(items[0]!.url).toBe(
      "https://www.reddit.com/r/startups/comments/1abc01/we_just_closed_a_12m_preseed/",
    );
  });

  it("disables gracefully when blocked", async () => {
    const http = createFixtureHttpClient({
      routes: [{ match: "reddit", status: 403, body: "<html>blocked</html>" }],
    });
    await expect(
      createRedditAdapter(def, fixtureCtx({ http })).fetch(DAY_AGO),
    ).rejects.toBeInstanceOf(SourceBlockedError);
  });
});
