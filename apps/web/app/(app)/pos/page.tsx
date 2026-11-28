"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ScanBarcodeIcon,
  PlusIcon,
  MinusIcon,
  Trash2Icon,
  ShoppingCartIcon,
  ArrowLeftIcon,
  PrinterIcon,
  CircleCheckIcon,
  ChevronRightIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, formatRWF, formatDateTime } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";
import { PhoneInput } from "@/components/phone-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ErrorAlert } from "@/components/state";
import { SearchInput } from "@/components/search-input";

type SearchResult = {
  variantId: string;
  productName: string;
  label: string;
  sku: string;
  price: number;
  sellable: number;
};

type CatalogItem = SearchResult & { brand: string | null; categoryId: string | null; category: string | null };

type CartLine = SearchResult & { qty: number };

type Payment = { id: string; method: string; amount: string; reference: string };

type CompletedSale = {
  id: string;
  receiptNumber: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  changeDue: number;
  completedAt: string;
  items: { label: string; sku: string; quantity: number; unitPrice: number }[];
  payments: { method: string; amount: number; reference: string | null }[];
};

const METHODS = [
  { id: "cash", label: "Cash" },
  { id: "mobile_money", label: "Mobile Money" },
  { id: "card", label: "Card" },
  { id: "bank_transfer", label: "Bank transfer" },
];

export default function PosPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [mobileView, setMobileView] = useState<"catalog" | "cart">("catalog");
  const [step, setStep] = useState<"cart" | "payment" | "done">("cart");
  const [payments, setPayments] = useState<Payment[]>([
    { id: "p1", method: "cash", amount: "", reference: "" },
  ]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [browseCategory, setBrowseCategory] = useState("");
  const [browseItems, setBrowseItems] = useState<CatalogItem[]>([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browsePage, setBrowsePage] = useState(1);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sale, setSale] = useState<CompletedSale | null>(null);
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const searchRef = useRef<HTMLInputElement>(null);

  const subtotal = useMemo(() => cart.reduce((sum, l) => sum + l.price * l.qty, 0), [cart]);
  const discountValue = Math.min(Math.max(0, Number(discount) || 0), subtotal);
  const total = Math.max(0, subtotal - discountValue);
  const paid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const hasCash = payments.some((p) => p.method === "cash" && (Number(p.amount) || 0) > 0);
  const changeDue = hasCash && paid > total ? paid - total : 0;
  const remaining = Math.max(0, total - paid);
  const canConfirm =
    cart.length > 0 && paid >= total && (paid === total || hasCash) && !submitting;

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api<{ items: SearchResult[] }>(`/pos/search?q=${encodeURIComponent(trimmed)}`)
        .then((r) => setResults(r.items))
        .catch(() => setResults([]))
        .finally(() => {
          setSearching(false);
          setSearched(true);
        });
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // Categories for the browse filter — fetched once; empty list just hides the chips.
  useEffect(() => {
    api<{ items: { id: string; name: string; active?: boolean }[] }>("/categories")
      .then((r) => setCategories(r.items.filter((c) => c.active !== false).map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => setCategories([]));
  }, []);

  const BROWSE_SIZE = 48;

  // Browsable catalogue: what you see when the search box is empty.
  useEffect(() => {
    if (query.trim().length >= 2) return; // search mode takes over
    let cancelled = false;
    const t = setTimeout(() => {
      setBrowseLoading(true); // async callback — safe setState
      const qs = new URLSearchParams({ page: "1", pageSize: String(BROWSE_SIZE) });
      if (browseCategory) qs.set("categoryId", browseCategory);
      api<{ items: CatalogItem[]; total: number }>(`/pos/catalog?${qs}`)
        .then((r) => {
          if (cancelled) return;
          setBrowseItems(r.items);
          setBrowseTotal(r.total);
          setBrowsePage(1);
        })
        .catch(() => {
          if (cancelled) return;
          setBrowseItems([]);
          setBrowseTotal(0);
        })
        .finally(() => {
          if (!cancelled) setBrowseLoading(false);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [browseCategory, query]);

  function loadMoreBrowse() {
    setBrowseLoadingMore(true);
    const qs = new URLSearchParams({ page: String(browsePage + 1), pageSize: String(BROWSE_SIZE) });
    if (browseCategory) qs.set("categoryId", browseCategory);
    api<{ items: CatalogItem[]; total: number }>(`/pos/catalog?${qs}`)
      .then((r) => {
        setBrowseItems((cur) => (browsePage + 1 === 1 ? r.items : [...cur, ...r.items]));
        setBrowseTotal(r.total);
        setBrowsePage((p) => p + 1);
      })
      .catch(() => toast.error("We couldn't load more products", { description: "Check your connection and try again." }))
      .finally(() => setBrowseLoadingMore(false));
  }

  function addToCart(item: SearchResult, qty = 1) {
    setCart((lines) => {
      const existing = lines.find((l) => l.variantId === item.variantId);
      if (existing) {
        return lines.map((l) =>
          l.variantId === item.variantId ? { ...l, qty: Math.min(l.qty + qty, l.sellable) } : l,
        );
      }
      return [...lines, { ...item, qty: Math.min(qty, item.sellable) }];
    });
    setQuery("");
    setResults([]);
    searchRef.current?.focus();
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    const exact = results.find(
      (r) => r.sku.toLowerCase() === trimmed.toLowerCase() || r.label.toLowerCase() === trimmed.toLowerCase(),
    );
    const target = exact ?? results[0];
    if (target) addToCart(target, 1);
    else toast.message("No match", { description: "Scan a barcode or type at least 2 characters." });
  }

  function updateQty(variantId: string, delta: number) {
    setCart((lines) =>
      lines
        .map((l) => (l.variantId === variantId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
        .map((l) => (l.qty > l.sellable ? { ...l, qty: l.sellable } : l)),
    );
  }

  function updatePayment(id: string, patch: Partial<Payment>) {
    setPayments((rows) => rows.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function newSale() {
    setCart([]);
    setDiscount("");
    setCustomerPhone("");
    setPayments([{ id: crypto.randomUUID(), method: "cash", amount: "", reference: "" }]);
    setSale(null);
    setError(null);
    setStep("cart");
    setMobileView("catalog");
    idempotencyKey.current = crypto.randomUUID();
    searchRef.current?.focus();
  }

  async function confirmSale() {
    setError(null);
    const phoneResult = customerPhone.trim() ? normalizePhone(customerPhone) : null;
    if (phoneResult && !phoneResult.ok) {
      setError(phoneResult.message ?? "Customer phone isn't valid.");
      return;
    }
    const invalidPayment = payments.find((p) => p.amount.trim() !== "" && Number(p.amount) < 0);
    if (invalidPayment) {
      setError("Payment amounts can't be negative.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await api<CompletedSale>("/sales", {
        method: "POST",
        idempotencyKey: idempotencyKey.current,
        body: {
          customerPhone: phoneResult?.value ?? null,
          items: cart.map((l) => ({ variantId: l.variantId, quantity: l.qty })),
          discountTotal: discountValue,
          payments: payments
            .filter((p) => Number(p.amount) > 0)
            .map((p) => ({
              method: p.method,
              amount: Number(p.amount),
              reference: p.reference.trim() || null,
            })),
        },
      });
      setSale(result);
      setStep("done");
      toast.success(`Sale ${result.receiptNumber} completed`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 0 || err.status >= 500) {
          setError(
            "We couldn't confirm the sale went through. Please check Sales history for a receipt before trying again — if it isn't listed, try again.",
          );
        } else {
          setError(err.message);
        }
      } else {
        setError("We couldn't confirm the sale went through. Please check Sales history before trying again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------- done step ---------- */
  if (step === "done" && sale) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4 pt-8 sm:p-6 receipt-page">
        <div className="flex flex-col items-center gap-2 text-center print:hidden">
          <CircleCheckIcon className="size-12 text-emerald-600" aria-hidden />
          <h1 className="text-xl font-semibold">Sale complete</h1>
          <p className="text-sm text-muted-foreground">Receipt {sale.receiptNumber}</p>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-3 pt-2 font-mono text-sm">
            <div className="text-center">
              <p className="text-base font-bold">ClothFlow</p>
              <p className="text-xs">Receipt {sale.receiptNumber}</p>
              <p className="text-xs">{formatDateTime(sale.completedAt)}</p>
            </div>
            <div className="border-t border-dashed border-border pt-2">
              {sale.items.map((item, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span>{item.quantity} × {item.label}</span>
                  <span>{formatRWF(item.quantity * item.unitPrice)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-border pt-2">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatRWF(sale.subtotal)}</span></div>
              {sale.discountTotal > 0 ? <div className="flex justify-between"><span>Discount</span><span>-{formatRWF(sale.discountTotal)}</span></div> : null}
              <div className="flex justify-between font-bold"><span>Total</span><span>{formatRWF(sale.total)}</span></div>
              {sale.payments.map((p, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate" title={p.reference ? `${METHODS.find((m) => m.id === p.method)?.label ?? p.method} · ${p.reference}` : undefined}>{METHODS.find((m) => m.id === p.method)?.label ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                  <span className="shrink-0">{formatRWF(p.amount)}</span>
                </div>
              ))}
              {sale.changeDue > 0 ? <div className="flex justify-between"><span>Change due</span><span>{formatRWF(sale.changeDue)}</span></div> : null}
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            <PrinterIcon aria-hidden /> Print receipt
          </Button>
          <Link href={`/sales/${sale.id}`} className={buttonVariants({ variant: "outline" })}>
            Open sale
          </Link>
          <Button onClick={newSale}>New sale</Button>
        </div>
      </div>
    );
  }

  /* ---------- payment step ---------- */
  if (step === "payment") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-4 pt-6 sm:p-6">
        <button onClick={() => setStep("cart")} className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" aria-hidden /> Back to cart
        </button>

        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Payment</h1>

        <Card>
          <CardContent className="flex flex-col gap-3 pt-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Amount due</span>
              <span className="text-2xl font-semibold tabular-nums">{formatRWF(total)}</span>
            </div>
            {discountValue > 0 ? (
              <p className="text-xs text-muted-foreground">Includes {formatRWF(discountValue)} discount on {formatRWF(subtotal)} subtotal.</p>
            ) : null}

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment lines</span>
              {payments.map((payment) => (
                <div key={payment.id} className="grid grid-cols-12 gap-2">
                  <NativeSelect
                    className="col-span-4"
                    aria-label="Payment method"
                    value={payment.method}
                    onChange={(e) => updatePayment(payment.id, { method: e.target.value })}
                  >
                    {METHODS.map((m) => (
                      <NativeSelectOption key={m.id} value={m.id}>{m.label}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Input
                    className="col-span-4 tabular-nums"
                    aria-label="Amount"
                    inputMode="numeric"
                    placeholder="0"
                    value={payment.amount}
                    onChange={(e) => updatePayment(payment.id, { amount: e.target.value.replace(/[^\d.]/g, "") })}
                  />
                  <Input
                    className="col-span-3"
                    aria-label="Reference (optional)"
                    placeholder="e.g. MOMO-2841"
                    value={payment.reference}
                    onChange={(e) => updatePayment(payment.id, { reference: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="col-span-1"
                    aria-label="Remove payment line"
                    disabled={payments.length === 1}
                    onClick={() => setPayments((rows) => rows.filter((p) => p.id !== payment.id))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => setPayments((rows) => [...rows, { id: crypto.randomUUID(), method: "cash", amount: "", reference: "" }])}
              >
                <PlusIcon aria-hidden /> Add payment line
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="tabular-nums font-medium">{formatRWF(paid)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Remaining</span><span className="tabular-nums font-medium">{formatRWF(remaining)}</span></div>
              {changeDue > 0 ? (
                <div className="flex justify-between text-emerald-700"><span>Change due</span><span className="tabular-nums font-semibold">{formatRWF(changeDue)}</span></div>
              ) : null}
              {paid > total && !hasCash ? (
                <p className="mt-1 text-xs text-destructive">Overpayment is only allowed for cash (change due). Adjust the amounts.</p>
              ) : null}
            </div>

            {error ? <ErrorAlert title="Sale not confirmed" message={error} /> : null}

            <Button size="lg" className="w-full" disabled={!canConfirm} onClick={confirmSale}>
              {submitting ? "Confirming sale…" : `Confirm paid sale · ${formatRWF(total)}`}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              The server recalculates prices and stock — nothing is committed until you confirm.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // One tile design shared by search results and the browsable catalogue.
  function renderTile(item: SearchResult) {
    return (
      <li key={item.variantId}>
        <button
          onClick={() => addToCart(item, 1)}
          disabled={item.sellable <= 0}
          className="flex w-full flex-col gap-1 rounded-xl border border-border bg-card p-3 text-left transition-colors enabled:hover:border-primary enabled:hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-semibold">{item.productName}</span>
            <Badge variant={item.sellable === 0 ? "destructive" : item.sellable <= 3 ? "warning" : "success"} className="tabular-nums">
              {item.sellable} left
            </Badge>
          </span>
          <span className="min-w-0 truncate text-xs text-muted-foreground" title={`${item.label} · ${item.sku}`}>{item.label} · {item.sku}</span>
          <span className="text-base font-semibold tabular-nums">{item.price == null ? "—" : formatRWF(item.price)}</span>
        </button>
      </li>
    );
  }

  const browseChip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
    }`;

  const browseGrid = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
        <button type="button" aria-pressed={browseCategory === ""} onClick={() => setBrowseCategory("")} className={browseChip(browseCategory === "")}>
          All products
        </button>
        {categories.map((cat) => (
          <button key={cat.id} type="button" aria-pressed={browseCategory === cat.id} onClick={() => setBrowseCategory(cat.id)} className={browseChip(browseCategory === cat.id)}>
            {cat.name}
          </button>
        ))}
      </div>

      {browseLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading products…</p>
      ) : browseItems.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <ShoppingCartIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No products here yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">Once products are added to the catalogue, you can tap them here to add them to the sale — no typing needed.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{browseTotal} product{browseTotal === 1 ? "" : "s"} · tap to add</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {browseItems.map(renderTile)}
          </ul>
          {browseItems.length < browseTotal ? (
            <Button variant="outline" className="mx-auto" disabled={browseLoadingMore} onClick={loadMoreBrowse}>
              {browseLoadingMore ? "Loading…" : `Show more (${browseTotal - browseItems.length} left)`}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );

  /* ---------- cart step ---------- */
  const cartPane = (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingCartIcon className="size-4" aria-hidden /> Cart
          {cart.length > 0 ? <Badge variant="secondary">{cart.length}</Badge> : null}
        </h2>
        {cart.length > 0 ? (
          <button className="text-xs font-medium text-muted-foreground hover:text-destructive" onClick={() => setCart([])}>
            Clear cart
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <ScanBarcodeIcon className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Cart is empty</p>
            <p className="max-w-56 text-xs text-muted-foreground">Scan a barcode or search a product to start the sale.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {cart.map((line) => (
              <li key={line.variantId} className="flex flex-col gap-1.5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{line.productName}</p>
                    <p className="max-w-56 truncate text-xs text-muted-foreground" title={`${line.label} · ${line.sku}`}>{line.label} · {line.sku}</p>
                  </div>
                  <Button variant="ghost" size="xs" onClick={() => setCart((l) => l.filter((x) => x.variantId !== line.variantId))} aria-label={`Remove ${line.productName} ${line.label} from the sale`} className="gap-1.5 text-muted-foreground hover:text-destructive">
                    <Trash2Icon className="size-4" aria-hidden /> Remove
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="icon-xs" onClick={() => updateQty(line.variantId, -1)} aria-label="Decrease quantity">
                      <MinusIcon />
                    </Button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">{line.qty}</span>
                    <Button variant="outline" size="icon-xs" onClick={() => updateQty(line.variantId, +1)} aria-label="Increase quantity" disabled={line.qty >= line.sellable}>
                      <PlusIcon />
                    </Button>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatRWF(line.price * line.qty)}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{formatRWF(line.price)} each · {line.sellable} in stock</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border p-3 sm:p-4">
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatRWF(subtotal)}</span></div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="discount" className="text-muted-foreground">Discount (RWF)</Label>
            <Input id="discount" className="h-7 w-28 text-right tabular-nums" inputMode="numeric" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d]/g, ""))} />
          </div>
          <div className="flex justify-between text-base font-semibold"><span>Payable</span><span className="tabular-nums">{formatRWF(total)}</span></div>
        </div>
        <div className="mt-2">
          <Label htmlFor="customer" className="text-xs text-muted-foreground">Customer phone (optional)</Label>
          <PhoneInput id="customer" value={customerPhone} onValueChange={setCustomerPhone} className="mt-1 h-9" />
        </div>
        <Button className="mt-3 w-full" size="lg" disabled={cart.length === 0} onClick={() => setStep("payment")}>
          Proceed to payment <ChevronRightIcon aria-hidden />
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-7xl flex-col gap-3 p-3 sm:p-4 lg:flex-row">
      {/* Catalogue side */}
      <div className={`flex min-h-0 flex-1 flex-col gap-3 ${mobileView === "cart" ? "hidden lg:flex" : "flex"}`}>
        <SearchInput
          size="lg"
          inputRef={searchRef}
          autoFocus
          ariaLabel="Search or scan barcode"
          placeholder="Scan barcode or search product / SKU…"
          value={query}
          onChange={setQuery}
          onKeyDown={onSearchKeyDown}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {searching ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Searching…</p>
          ) : results.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {results.map(renderTile)}
            </ul>
          ) : searched ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No match for “{query.trim()}”. Check the spelling, SKU or barcode.
              </p>
              <Button variant="outline" onClick={() => setQuery("")}>Browse all products</Button>
            </div>
          ) : (
            browseGrid
          )}
        </div>

        {/* Mobile cart summary bar */}
        <button
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-primary px-4 py-3 text-primary-foreground lg:hidden"
          onClick={() => setMobileView("cart")}
        >
          <span className="text-sm font-semibold">{cart.length} item{cart.length === 1 ? "" : "s"} · {formatRWF(total)}</span>
          <span className="flex items-center gap-1 text-sm font-medium">Review sale <ChevronRightIcon className="size-4" /></span>
        </button>
      </div>

      {/* Cart side */}
      <div className={`min-h-0 w-full lg:w-96 ${mobileView === "cart" ? "flex" : "hidden lg:flex"} flex-col`}>
        {mobileView === "cart" ? (
          <button onClick={() => setMobileView("catalog")} className="mb-2 flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <ArrowLeftIcon className="size-4" aria-hidden /> Back to catalogue
          </button>
        ) : null}
        <div className="min-h-0 flex-1">{cartPane}</div>
      </div>
    </div>
  );
}
