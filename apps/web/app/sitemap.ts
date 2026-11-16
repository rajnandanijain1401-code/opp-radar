import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.RADAR_PUBLIC_URL ?? "http://localhost:3000";
  const days = Array.from({ length: 30 }, (_, i) =>
    new Date(Date.now() - (i + 1) * 86_400_000).toISOString().slice(0, 10),
  );
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/signals`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
    ...days.map((d) => ({
      url: `${base}/signals/${d}`,
      changeFrequency: "never" as const,
      priority: 0.4,
    })),
  ];
}
