import Link from "next/link";
import { ShirtIcon, ArrowLeftIcon, HomeIcon } from "lucide-react";

export const metadata = {
  title: "Page not found — ClothFlow",
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <ShirtIcon className="size-7" aria-hidden />
      </span>
      <div className="flex flex-col gap-2">
        <p className="text-6xl font-bold tracking-tight text-muted-foreground/40 tabular-nums">404</p>
        <h1 className="text-xl font-semibold tracking-tight">This rack is empty</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The page you were looking for doesn&apos;t exist or was moved. Check the address, or head back to the workspace.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <HomeIcon className="size-4" aria-hidden /> Dashboard
        </Link>
        <Link
          href="/signin"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
        >
          <ArrowLeftIcon className="size-4" aria-hidden /> Sign in
        </Link>
      </div>
    </main>
  );
}
