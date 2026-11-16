import { describe, expect, it } from "vitest";
import { canonicalizeUrl, resolveGoogleNewsUrl, urlKey } from "../../src/normalize/url";

describe("canonicalizeUrl", () => {
  it("strips UTM and tracking params, fragments and trailing slashes", () => {
    expect(
      canonicalizeUrl(
        "http://WWW.Example.com/a/b/?utm_source=rss&utm_medium=feed&id=7&fbclid=x&from=mdr#top",
      ),
    ).toBe("https://www.example.com/a/b?id=7");
  });

  it("sorts remaining query params so order does not matter", () => {
    expect(canonicalizeUrl("https://x.com/p?b=2&a=1")).toBe(
      canonicalizeUrl("https://x.com/p?a=1&b=2"),
    );
  });

  it("treats AMP and www variants as the same article", () => {
    expect(urlKey(canonicalizeUrl("https://www.site.com/story/amp"))).toBe(
      urlKey(canonicalizeUrl("https://site.com/story")),
    );
  });

  it("returns input for unparsable URLs", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
  });
});

describe("Google News redirect URLs", () => {
  const gn =
    "https://news.google.com/rss/articles/CBMibWh0dHBzOi8vZWNvbm9taWN0aW1lcy5pbmRpYXRpbWVzLmNvbS90ZWNoL2Z1bmRpbmcvemV0YS1wYXktcmFpc2VzLTIwLW1pbGxpb24tc2VyaWVzLWIvYXJ0aWNsZXNob3cvMTEwMDAwMS5jbXPSAQA?oc=5";
  it("decodes classic article ids to the publisher URL", () => {
    expect(resolveGoogleNewsUrl(gn)).toBe(
      "https://economictimes.indiatimes.com/tech/funding/zeta-pay-raises-20-million-series-b/articleshow/1100001.cms",
    );
  });
  it("canonicalizes to the same URL as the publisher link with tracking params", () => {
    expect(canonicalizeUrl(gn)).toBe(
      canonicalizeUrl(
        "https://economictimes.indiatimes.com/tech/funding/zeta-pay-raises-20-million-series-b/articleshow/1100001.cms?utm_source=rss&utm_medium=feed&from=mdr",
      ),
    );
  });
  it("leaves opaque new-style ids alone", () => {
    expect(
      resolveGoogleNewsUrl("https://news.google.com/rss/articles/CBMiAU_yqLOpaque?oc=5"),
    ).toBeNull();
    expect(resolveGoogleNewsUrl("https://example.com/rss/articles/x")).toBeNull();
  });
});
