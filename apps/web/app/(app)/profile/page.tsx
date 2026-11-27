"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserIcon, KeyRoundIcon, CircleCheckIcon, EyeIcon, EyeOffIcon, LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/state";

type Me = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  createdAt: string | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/auth/me")
      .then(setMe)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "We couldn't load your profile. Check your internet connection and try again."),
      )
      .finally(() => setLoading(false));
  }, []);

  const initials = (me?.name ?? me?.email ?? "S")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (next.length < 10) {
      setFormError("New password must be at least 10 characters.");
      return;
    }
    if (next !== confirm) {
      setFormError("New passwords do not match.");
      return;
    }
    setPending(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: { currentPassword: current, newPassword: next },
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password updated");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "We couldn't update your password. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await api("/auth/signout", { method: "POST" });
    } catch {
      // sign-out is best-effort; leave the page either way
    }
    router.push("/signin");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">My profile</h1>
        <p className="text-sm text-muted-foreground">Your account and security.</p>
      </div>

      {error ? <ErrorAlert message={error} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="text-lg font-semibold">{initials || "S"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base font-semibold">
              {me?.name ?? "Staff account"}
              {me?.role ? <Badge variant="secondary" className="uppercase text-[10px]">{me.role}</Badge> : null}
            </p>
            <p className="truncate text-sm text-muted-foreground">{me?.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRoundIcon className="size-4" aria-hidden /> Change password</CardTitle>
          <CardDescription>Use at least 10 characters. Your other sessions stay signed in.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input id="current-password" type={show ? "text" : "password"} required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type={show ? "text" : "password"} required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" type={show ? "text" : "password"} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              aria-pressed={show}
            >
              {show ? <EyeOffIcon className="size-4" aria-hidden /> : <EyeIcon className="size-4" aria-hidden />}
              {show ? "Hide passwords" : "Show passwords"}
            </button>
            {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
            <Button type="submit" className="w-fit" disabled={pending}>
              {pending ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LogOutIcon className="size-4" aria-hidden /> Sign out</CardTitle>
          <CardDescription>End your session on this device. You can sign back in at any time.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={signOut} disabled={signingOut}>
            <LogOutIcon aria-hidden /> {signingOut ? "Signing out…" : "Sign out of ClothFlow"}
          </Button>
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <UserIcon className="size-3.5" aria-hidden /> Profile names come from your store owner. Contact them to change your name or role.
        <CircleCheckIcon className="ml-auto size-3.5 text-emerald-600" aria-hidden />
      </p>
    </div>
  );
}
