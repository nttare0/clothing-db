"use client";

// Demo-mode module state, shared between the API client (sync reads during
// fetch/useEffect) and React components (the banner) via useSyncExternalStore.
// The initial value arrives from the server layout; flipping it client-side
// (first real write, or "remove demo data") updates every subscriber instantly.

import { useSyncExternalStore } from "react";
import { clearApiCache } from "./api-cache";

// Initial value: injected by the server layout via an inline script
// (window.__CLOTHFLOW_DEMO__) before any bundle code runs. Deterministic
// across the client realm; always false on the server — hydration therefore
// matches SSR HTML exactly, and useSyncExternalStore flips the banner on
// immediately after mount.
let active =
  typeof window !== "undefined" &&
  Boolean((window as unknown as { __CLOTHFLOW_DEMO__?: boolean }).__CLOTHFLOW_DEMO__);
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setDemoActive(value: boolean): void {
  if (active === value) return;
  active = value;
  if (!value) clearApiCache();
  emit();
}

export function isDemoActive(): boolean {
  return active;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return active;
}

// Must return the SSR value on the server AND during client hydration,
// so the hydration render matches the server HTML. The banner flips on
// right after hydration when React re-reads getSnapshot().
function getServerSnapshot(): boolean {
  return false;
}

/** React hook for components (banner, badges). */
export function useDemoActive(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * The store owner started doing real work: end the demo everywhere
 * (banner, fixtures, cached data) and tell the server to remember it —
 * fire and forget, the local flip happens synchronously.
 */
export function markDemoWorked(): void {
  if (!active) return;
  active = false;
  clearApiCache();
  emit();
  try {
    void fetch("/api/demo/remove", { method: "POST", credentials: "same-origin" }).catch(() => {});
  } catch {
    // The server state is only a cross-device convenience; local state already flipped.
  }
}

export type DemoCompletedSale = {
  id: string;
  receiptNumber: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  changeDue: number;
  completedAt: string;
  customerPhone: string | null;
  items: { variantId: string; productId: string; label: string; sku: string; quantity: number; unitPrice: number }[];
  payments: { method: string; amount: number; reference: string | null }[];
};

let lastDemoSale: DemoCompletedSale | null = null;

/** Store the synthetic receipt so the receipt page can render it as a fixture. */
export function rememberDemoSale(sale: DemoCompletedSale): void {
  lastDemoSale = sale;
}

/** Look up a remembered synthetic receipt (undefined after navigation/reload). */
export function getRememberedDemoSale(id: string): DemoCompletedSale | null {
  return lastDemoSale && (lastDemoSale.id === id || lastDemoSale.receiptNumber === id) ? lastDemoSale : null;
}

/** User clicked "Remove demo data" in the banner. */
export function dismissDemo(): void {
  markDemoWorked();
}
