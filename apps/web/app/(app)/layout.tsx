import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { getDemoState } from "@/lib/server/demo";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  if (!store.has("clothflow_session")) {
    redirect("/signin");
  }
  // Demo mode is a client-side preview — queried on the server per navigation,
  // served from memory in the browser. Defaults to off when the check fails.
  let demoActive = false;
  try {
    demoActive = (await getDemoState()) === "active";
  } catch (err) {
    console.error("demo_state_failed", err);
  }
  return (
    <AppShell demoActive={demoActive}>
      {children}
      <Toaster richColors closeButton position="top-right" />
    </AppShell>
  );
}
