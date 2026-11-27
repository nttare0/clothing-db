import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  if (!store.has("clothflow_session")) {
    redirect("/signin");
  }
  // The demo flag is injected once in the root layout (first body node).
  return (
    <AppShell>
      {children}
      <Toaster richColors closeButton position="top-right" />
    </AppShell>
  );
}
