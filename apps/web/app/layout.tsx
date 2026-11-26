import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://clothflow-web.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ClothFlow — Clothing Store Management",
    template: "%s · ClothFlow",
  },
  description:
    "One store. Clear stock. Confident decisions. ClothFlow is the internal operations system for a single clothing store: catalogue, inventory, purchasing, point of sale, returns and reporting.",
  openGraph: {
    title: "ClothFlow — Clothing Store Management",
    description:
      "One store. Clear stock. Confident decisions. Catalogue, inventory, purchasing, POS, returns and reporting for a single clothing store.",
    url: siteUrl,
    siteName: "ClothFlow",
    type: "website",
    locale: "en_RW",
    images: [
      {
        url: "/og-image.jpg",
        width: 960,
        height: 640,
        alt: "ClothFlow — clothing store operations, inventory and point of sale",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClothFlow — Clothing Store Management",
    description:
      "One store. Clear stock. Confident decisions. Catalogue, inventory, purchasing, POS, returns and reporting for a single clothing store.",
    images: ["/og-image.jpg"],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#3157D5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
