"use client";

import { useMemo, useState } from "react";
import { DownloadIcon, DatabaseIcon, CheckSquareIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleGate } from "@/components/role-gate";

type Group = { label: string; hint: string; tables: { id: string; label: string }[] };

const GROUPS: Group[] = [
  {
    label: "Sales & returns",
    hint: "Every completed sale, its lines and its payments — plus returns and their reasons.",
    tables: [
      { id: "sales", label: "Sales / receipts" },
      { id: "sale_items", label: "Sale lines" },
      { id: "payments", label: "Payments" },
      { id: "returns", label: "Returns" },
      { id: "return_items", label: "Return lines" },
    ],
  },
  {
    label: "Catalogue & stock",
    hint: "Products, variants, the stock ledger, counts, purchases and supplier deliveries.",
    tables: [
      { id: "products", label: "Products" },
      { id: "product_variants", label: "Variants (SKU/size/price)" },
      { id: "categories", label: "Categories" },
      { id: "inventory_balances", label: "Stock on hand, damaged, quarantine" },
      { id: "stock_movements", label: "Stock ledger" },
      { id: "stock_counts", label: "Stock counts" },
      { id: "stock_count_items", label: "Counted lines" },
      { id: "purchases", label: "Purchases" },
      { id: "purchase_items", label: "Purchase lines" },
    ],
  },
  {
    label: "People",
    hint: "Customer and supplier records, and staff account details.",
    tables: [
      { id: "customers", label: "Customers" },
      { id: "suppliers", label: "Suppliers" },
      { id: "users", label: "Staff accounts (no passwords)" },
    ],
  },
  {
    label: "Money & admin",
    hint: "Expenses, settings and the audit trail.",
    tables: [
      { id: "expenses", label: "Expenses" },
      { id: "settings", label: "Store settings" },
      { id: "notifications", label: "Notifications" },
      { id: "audit_logs", label: "Audit log" },
    ],
  },
];

const ALL_TABLE_IDS = GROUPS.flatMap((g) => g.tables.map((t) => t.id));

export default function ExportPage() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(ALL_TABLE_IDS));

  const selectedCount = selected.size;
  const everything = selectedCount === ALL_TABLE_IDS.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(group: Group, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of group.tables) {
        if (on) next.add(t.id);
        else next.delete(t.id);
      }
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(ALL_TABLE_IDS) : new Set());
  }

  const downloadUrl = useMemo(
    () => (everything ? "/api/export" : `/api/export?tables=${[...selected].join(",")}`),
    [everything, selected],
  );

  return (
    <RoleGate allow={["owner"]}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl"><DatabaseIcon className="size-6" aria-hidden /> Export data</h1>
          <p className="text-sm text-muted-foreground">
            Download the store data as a JSON file — everything, or just the datasets you tick. Sessions, password hashes and reset codes are never exported.
          </p>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Choose what to include</CardTitle>
              <CardDescription>{selectedCount} of {ALL_TABLE_IDS.length} datasets selected.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => toggleAll(!everything)}>
              {everything ? <><SquareIcon aria-hidden /> Clear all</> : <><CheckSquareIcon aria-hidden /> Select all</>}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {GROUPS.map((group) => {
              const groupIds = group.tables.map((t) => t.id);
              const checkedCount = groupIds.filter((id) => selected.has(id)).length;
              const groupOn = checkedCount === groupIds.length;
              return (
                <fieldset key={group.label} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <legend className="text-sm font-semibold">{group.label}</legend>
                    <button
                      type="button"
                      className="text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                      onClick={() => toggleGroup(group, !groupOn)}
                    >
                      {groupOn ? "Untick group" : checkedCount > 0 ? `Tick remaining (${groupIds.length - checkedCount})` : "Tick group"}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">{group.hint}</p>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {group.tables.map((t) => (
                      <li key={t.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm hover:bg-muted/50">
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--color-primary,#3157d5)]"
                            checked={selected.has(t.id)}
                            onChange={() => toggle(t.id)}
                          />
                          <span className="min-w-0 truncate">{t.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{everything ? "Full export" : `${selectedCount} dataset${selectedCount === 1 ? "" : "s"}`}</p>
            <p>A single .json file. Large stores can take a while — keep the tab open until the download starts.</p>
          </div>
          <Button size="lg" disabled={selectedCount === 0} onClick={() => window.location.assign(downloadUrl)}>
            <DownloadIcon aria-hidden /> Download data
          </Button>
        </div>
      </div>
    </RoleGate>
  );
}
