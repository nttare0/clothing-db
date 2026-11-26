"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeIcon, EyeOffIcon, ShirtIcon } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextParam = params.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api("/auth/signin", { method: "POST", body: { identifier, password } });
      router.replace(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "RATE_LIMITED") {
          setError("Too many attempts. Wait a minute and try again.");
        } else {
          setError("Invalid email or password.");
        }
      } else {
        setError("Could not reach the server. Check the connection and try again.");
      }
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="flex items-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ShirtIcon className="size-6" aria-hidden />
        </span>
        <div className="leading-tight">
          <p className="text-lg font-semibold tracking-tight">ClothFlow</p>
          <p className="text-xs text-muted-foreground">One store. Clear stock.</p>
        </div>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl"><h1 className="text-xl">Sign in</h1></CardTitle>
          <CardDescription>Use your staff account to open the store workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="identifier">Email or username</Label>
              <Input
                id="identifier"
                name="identifier"
                autoComplete="username"
                autoFocus
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-12"
                  placeholder="••••••••"
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
            </div>

            {error ? (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={pending} className="w-full">
              {pending ? "Signing in…" : "Sign in"}
            </Button>

            <a
              href="/forgot-password"
              className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Forgot your password?
            </a>
          </form>
        </CardContent>
      </Card>

      <p className="max-w-sm text-center text-xs text-muted-foreground">
        ClothFlow is a private system for store staff. Accounts are created by the store owner.
      </p>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
