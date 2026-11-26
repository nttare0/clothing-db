import type { Metadata } from "next";
import Link from "next/link";
import {
  ShoppingCartIcon,
  PackagePlusIcon,
  ShirtIcon,
  ArrowLeftRightIcon,
  PrinterIcon,
  WifiOffIcon,
  ShieldCheckIcon,
  CircleHelpIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Help" };

const TOPICS = [
  {
    icon: ShoppingCartIcon,
    title: "Ringing up a sale",
    steps: [
      "Open Sales / POS. Scan a barcode or type at least two characters of a product name or SKU.",
      "Tap the item card to add it. Adjust quantity with the − / + buttons; quantities can never exceed sellable stock.",
      "Optionally enter a discount (RWF) and the customer's phone number.",
      "Tap Proceed to payment, choose cash, Mobile Money, card or bank transfer. Splitting across methods is allowed.",
      "Overpayment is only accepted for cash — the difference shows as change due.",
      "Confirm. The server recalculates totals from live prices and stock; the sale is not complete until you see the receipt screen.",
      "Print the receipt or open Open sale to view it later from Sales history.",
    ],
  },
  {
    icon: PackagePlusIcon,
    title: "Receiving stock",
    steps: [
      "Open Stock In, then Receive stock.",
      "Scan or search each item and set the quantity received and the unit cost (optional but needed for moving-average cost).",
      "Pick the reason — purchase, opening stock, customer return, correction or transfer in — and reference (GRN or invoice number).",
      "Confirm. Quantities are sellable immediately and a movement is written to the ledger.",
    ],
  },
  {
    icon: ShirtIcon,
    title: "Adding a product or variant",
    steps: [
      "Open Inventory, then Add product. Enter the shared details and one variant row per size/colour with a unique SKU.",
      "Prices are in RWF. Selling price can be left blank and filled later; stock cannot enter before the product and variant exist.",
      "Add opening stock via Stock In after saving — creating a product never changes inventory.",
      "Low-stock badges appear when a variant drops to its reorder level.",
    ],
  },
  {
    icon: ArrowLeftRightIcon,
    title: "Reading the movement ledger",
    steps: [
      "Every quantity change — sale, receipt, return, adjustment — writes one immutable row.",
      "Δ is the change in on-hand units: green is stock entering, red is stock leaving.",
      "Use Stock Movements to filter by product, reference or type. Rows are never edited; mistakes are fixed with a new, opposite movement.",
    ],
  },
  {
    icon: PrinterIcon,
    title: "Receipts and reprints",
    steps: [
      "Completed sales live in Sales history with their receipt number.",
      "Open the sale and choose Reprint. Receipts use your browser's print dialog — choose your thermal or A4 printer.",
    ],
  },
  {
    icon: WifiOffIcon,
    title: "Connection lost",
    steps: [
      "If the amber offline banner appears, sales and receipts are blocked until the connection returns.",
      "Do not refresh during a payment. If Confirming sale… stalls, check Sales history for the receipt before trying again — the sale may already be saved.",
    ],
  },
  {
    icon: ShieldCheckIcon,
    title: "Your account",
    steps: [
      "Change your password from My profile (account menu, top right). Use at least 10 characters.",
      "If you are signed out unexpectedly, it means your session expired. Sign in again — no work is lost.",
      "Accounts are created by the store owner. Contact them for a new account, a name change or a different role.",
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CircleHelpIcon className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Help</h1>
          <p className="text-sm text-muted-foreground">Short answers for the tasks you do every day.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {TOPICS.map((topic) => (
          <Card key={topic.title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <topic.icon className="size-4 text-primary" aria-hidden />
                {topic.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex list-none flex-col gap-1.5 text-sm">
                {topic.steps.map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Still stuck?</CardTitle>
          <CardDescription>Contact the store owner. Include what you were doing and any on-screen error code.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            ClothFlow 1.0 · Single store · RWF. Screens marked with a stage label (Returns, Adjustments, Stock Count, Reports…) arrive in later build stages.
          </p>
          <p className="mt-2 text-sm">
            <Link href="/dashboard" className="font-medium text-primary hover:underline">Back to the dashboard</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
