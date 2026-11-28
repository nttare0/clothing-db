import Link from "next/link";
import Image from "next/image";
import { ArrowLeftIcon, HomeIcon } from "lucide-react";

export const metadata = {
  title: "Page not found — ClothFlow",
};

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 py-12 text-center">
      <Image
        src="/illustrations/not-found.png"
        alt="An empty clothing rack with a single hanger and price tag"
        width={880}
        height={480}
        priority
        className="w-full max-w-sm rounded-2xl object-cover sm:max-w-md"
      />
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Error 404</p>
        <h1 className="text-2xl font-semibold tracking-tight">This rack is empty</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
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
