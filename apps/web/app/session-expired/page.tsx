import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlertIcon, LogInIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Session expired" };

export default function SessionExpiredPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-10">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="items-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <ShieldAlertIcon className="size-6" aria-hidden />
          </span>
          <CardTitle className="text-xl"><h1 className="text-xl">Session expired</h1></CardTitle>
          <CardDescription>For your security, sign in again to continue. Nothing you entered was lost on the server.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Link href="/signin" className={buttonVariants({ size: "lg", className: "w-full" })}>
            <LogInIcon aria-hidden /> Sign in again
          </Link>
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Go to the start page
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
