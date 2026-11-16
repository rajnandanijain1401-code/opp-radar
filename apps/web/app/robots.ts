import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.RADAR_PUBLIC_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/onboarding", "/admin", "/api/", "/unsubscribe"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
