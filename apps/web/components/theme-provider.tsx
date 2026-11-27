"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** App-wide theme provider. Class strategy: next-themes sets .dark on <html>. */
export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
