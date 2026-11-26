"use client";

import { useEffect, useState } from "react";
import { LockIcon } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

type Me = { id: string; name: string | null; email: string; role: string };

/**
 * Client-side role gate for pages that are also enforced server-side (403 from the API).
 * The API remains the enforcement boundary; this keeps the UI honest.
 */
export function RoleGate({ allow, children }: { allow: string[]; children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null | "error">(null);

  useEffect(() => {
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => setMe("error"));
  }, []);

  if (me === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (me === "error" || !allow.includes(me.role)) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 p-6 pt-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <LockIcon className="size-6 text-muted-foreground" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Access denied</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This area is restricted to {allow.join(" or ")} accounts. Ask the store owner if you need access.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
