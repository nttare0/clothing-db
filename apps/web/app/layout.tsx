import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { getDemoState } from "@/lib/server/demo";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaRegister } from "@/components/pwa-register";

// Every route renders on demand: the demo flag must be fresh per request
// and never baked into statically prerendered HTML.
export const dynamic = "force-dynamic";

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
        width: 640,
        height: 427,
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
  appleWebApp: {
    capable: true,
    title: "ClothFlow",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#3157D5",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Demo flag injected before any app JS runs (first body node, parsed before
  // async module chunks execute). Failure → demo off, never a broken page.
  let demoActive = false;
  try {
    demoActive = (await getDemoState()) === "active";
  } catch (err) {
    console.error("root_demo_state_failed", err);
  }
  // Nonce for the per-request Content-Security-Policy (set in middleware.ts).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
          <PwaRegister />
          {demoActive ? (
            <script nonce={nonce} dangerouslySetInnerHTML={{ __html: "window.__CLOTHFLOW_DEMO__=true" }} />
          ) : null}
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
