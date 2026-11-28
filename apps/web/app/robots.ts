import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://clothflow-web.vercel.app";

// ClothFlow is a private store-operations system. Only the public sign-in,
// help and forgot-password pages may be indexed; everything behind the
// session (and the API) stays out of search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/signin", "/help", "/forgot-password"],
        disallow: ["/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
