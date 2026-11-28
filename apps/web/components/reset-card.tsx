"use client";

import { useState } from "react";
import { TriangleAlertIcon, CopyIcon, ShieldXIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Owner-only "wipe everything" flow. Two steps, never one click:
 * 1. Confirm the intent and generate a one-time code (shown once, 10-minute expiry).
 * 2. Re-enter the code — only then does the server erase all store data.
 */
export function ResetCard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"confirm" | "code">("confirm");
  const [code, setCode] = useState<string | null>(null);
  const [entered, setEntered] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setStep("confirm");
    setCode(null);
    setEntered("");
    setError(null);
    setPending(false);
  }

  async function generateCode() {
    setPending(true);
    setError(null);
    try {
      const r = await api<{ code: string }>("/reset/request", { method: "POST" });
      setCode(r.code);
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't generate the code. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function executeReset() {
    if (!code) return;
    setPending(true);
    setError(null);
    try {
      await api("/reset/confirm", { method: "POST", body: { code: entered.trim() } });
      toast.success("Store data has been reset");
      // Sessions were wiped too — land on the sign-in screen.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/signin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The reset did not run. Nothing was erased — try again.");
      setPending(false);
    }
  }

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive"><TriangleAlertIcon className="size-5" aria-hidden /> Danger zone</CardTitle>
          <CardDescription>Reset the entire store — every product, sale, stock movement, customer, supplier, expense and staff account. Only your owner account is kept so you can sign back in. This cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            <ShieldXIcon aria-hidden /> Reset all store data
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
        <DialogContent>
          {step === "confirm" ? (
            <>
              <DialogHeader>
                <DialogTitle>Erase everything?</DialogTitle>
                <DialogDescription>
                  This permanently deletes ALL store data: products, stock, sales, returns, purchases, customers,
                  suppliers, expenses, reports, staff accounts (except yours) and settings. There is no undo and no backup
                  is created automatically — use Export first if you need one.
                </DialogDescription>
              </DialogHeader>
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button variant="outline" onClick={close}>Keep everything</Button>
                <Button variant="destructive" onClick={generateCode} disabled={pending}>
                  {pending ? "Generating…" : "Generate reset code"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Re-enter your reset code</DialogTitle>
                <DialogDescription>
                  A one-time code was generated — it expires in 10 minutes and works once. Type it below to confirm the wipe.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                {code ? (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <code className="flex-1 text-center font-mono text-2xl font-semibold tracking-[0.3em]">{code}</code>
                    <Button variant="outline" size="icon-sm" aria-label="Copy code" onClick={() => navigator.clipboard?.writeText(code).then(() => toast.success("Code copied"))}>
                      <CopyIcon />
                    </Button>
                  </div>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reset-code">Reset code</Label>
                  <Input
                    id="reset-code"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="123456"
                    maxLength={6}
                    className="font-mono text-lg tracking-[0.3em]"
                    value={entered}
                    onChange={(e) => setEntered(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoFocus
                  />
                </div>
                {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button variant="destructive" onClick={executeReset} disabled={pending || entered.length !== 6}>
                  {pending ? "Erasing everything…" : "Erase everything"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
