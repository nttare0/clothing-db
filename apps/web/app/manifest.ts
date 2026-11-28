import type { MetadataRoute } from "next";

// Web app manifest — makes ClothFlow installable ("download like web.whatsapp").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClothFlow — Clothing Store Management",
    short_name: "ClothFlow",
    description:
      "One store. Clear stock. Confident decisions. ClothFlow is the internal operations system for a single clothing store.",
    id: "/dashboard",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#3157d5",
    theme_color: "#3157d5",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
