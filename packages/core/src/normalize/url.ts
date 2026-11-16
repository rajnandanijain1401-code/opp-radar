const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "ref_url",
  "referrer",
  "source",
  "src",
  "from",
  "cmpid",
  "ncid",
  "sr_share",
  "share",
  "oc",
  "guccounter",
  "guce_referrer",
  "guce_referrer_sig",
  "_ga",
  "_gl",
  "spm",
  "s_cid",
  "trk",
  "feed",
  "rss",
  "amp",
  "outputtype",
]);

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.startsWith("utm_") || k.startsWith("pk_") || k.startsWith("mtm_") || TRACKING_PARAMS.has(k)
  );
}

/**
 * Google News article links wrap the publisher URL in a base64url payload.
 * The classic format ("CBMi...") embeds the URL in plain bytes and decodes offline.
 * The newer opaque format needs a call to Google; we return null and fall back to title dedupe.
 */
export function resolveGoogleNewsUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname !== "news.google.com") return null;
  const m = u.pathname.match(/\/(?:rss\/)?articles\/([^/?#]+)/);
  if (!m) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(m[1]!, "base64url");
  } catch {
    return null;
  }
  const s = bytes.toString("latin1");
  const start = s.indexOf("http");
  if (start === -1) return null;
  let end = start;
  while (end < s.length) {
    const c = s.charCodeAt(end);
    if (c < 0x21 || c > 0x7e) break;
    end++;
  }
  const candidate = s.slice(start, end);
  try {
    const parsed = new URL(candidate);
    return parsed.protocol.startsWith("http") ? candidate : null;
  } catch {
    return null;
  }
}

/** Canonical URL: https, lowercase host, no fragment, no tracking params, sorted query, no trailing slash. */
export function canonicalizeUrl(input: string): string {
  const resolved = resolveGoogleNewsUrl(input) ?? input;
  let u: URL;
  try {
    u = new URL(resolved.trim());
  } catch {
    return input.trim();
  }
  if (u.protocol === "http:") u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  const kept = [...u.searchParams.entries()]
    .filter(([k]) => !isTrackingParam(k))
    .sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);
  if (u.pathname.length > 1 && u.pathname.endsWith("/"))
    u.pathname = u.pathname.replace(/\/+$/, "");
  // AMP variants point at the same article.
  u.pathname = u.pathname.replace(/\/amp$/, "").replace(/^\/amp\//, "/");
  return u.toString();
}

/** Key used for exact URL dedupe: canonical URL without scheme and "www.". */
export function urlKey(canonical: string): string {
  return canonical.replace(/^https?:\/\//, "").replace(/^www\./, "");
}
