import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://clothflow-web.vercel.app";

// Only the public pages. Everything behind the session is disallowed in
// robots.txt and marked noindex, so it is intentionally absent here.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-11-28T00:00:00.000Z");
  return [
    { url: `${siteUrl}/signin`, lastModified, changeFrequency: "monthly", priority: 1.0 },
    { url: `${siteUrl}/help`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/forgot-password`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
