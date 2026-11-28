"use client";


import { useState } from "react";
import { ShirtIcon } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "RATE_LIMITED") {
        setError("Too many requests. Wait a minute and try again.");
      } else {
        setError("We couldn't send the reset instructions. Check your internet connection and try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <a href="/signin" className="flex items-center gap-2.5" aria-label="Back to sign in">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShirtIcon className="size-5" aria-hidden />
        </span>
        <span className="text-base font-semibold tracking-tight">ClothFlow</span>
      </a>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl"><h1 className="text-xl">Reset password</h1></CardTitle>
          <CardDescription>
            Enter your account email and we&apos;ll send you instructions to set a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div role="status" className="flex flex-col gap-4">
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                If an account exists for <strong>{email}</strong>, reset instructions have been sent. The link expires shortly and can be used once.
              </p>
              <a href="/signin" className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline">
                Back to sign in
              </a>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              {error ? (
                <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" size="lg" disabled={pending} className="w-full">
                {pending ? "Sending…" : "Send reset instructions"}
              </Button>
              <a href="/signin" className="text-center text-sm font-medium text-muted-foreground hover:text-foreground">
                Back to sign in
              </a>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
