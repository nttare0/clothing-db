"use client";


import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeIcon, EyeOffIcon, ShirtIcon } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 10;
  const mismatch = confirm.length > 0 && password !== confirm;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
      setTimeout(() => router.replace("/signin"), 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "TOKEN_EXPIRED" || err.code === "TOKEN_INVALID") {
          setError("This reset link is invalid or has expired. Request a new one.");
        } else if (err.code === "WEAK_PASSWORD") {
          setError("That password is too common. Choose a stronger one.");
        } else {
          setError(err.message);
        }
      } else {
        setError("We can't reach the server right now. Check your internet connection and try again.");
      }
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl"><h1 className="text-xl">Reset link missing</h1></CardTitle>
          <CardDescription>This page needs the token from your reset email.</CardDescription>
        </CardHeader>
        <CardContent>
          <a href="/forgot-password" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Request a new reset link
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl"><h1 className="text-xl">Choose a new password</h1></CardTitle>
        <CardDescription>Use at least 10 characters. Avoid reusing old passwords.</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Password updated. Taking you to sign in…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  autoFocus
                  required
                  aria-invalid={tooShort || undefined}
                  aria-describedby="password-hint"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOffIcon className="size-5" aria-hidden /> : <EyeIcon className="size-5" aria-hidden />}
                </button>
              </div>
              <p id="password-hint" className="text-xs text-muted-foreground">At least 10 characters.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                aria-invalid={mismatch || undefined}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {mismatch ? <p className="text-xs text-destructive">Passwords do not match.</p> : null}
            </div>

            {error ? (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={pending} className="w-full">
              {pending ? "Saving…" : "Save new password"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShirtIcon className="size-5" aria-hidden />
        </span>
        <span className="text-base font-semibold tracking-tight">ClothFlow</span>
      </div>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
