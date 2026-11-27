"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/state";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "One size"];

export type VariantDraft = {
  id?: string;
  size: string;
  colour: string;
  sku: string;
  barcode: string;
  sellingPrice: string;
  reorderLevel: string;
};

const EMPTY_VARIANT: VariantDraft = {
  size: "",
  colour: "",
  sku: "",
  barcode: "",
  sellingPrice: "",
  reorderLevel: "0",
};

export type ProductFormInitial = {
  name: string;
  categoryId: string | null;
  brand: string;
  description: string;
  variants: VariantDraft[];
};

export function ProductForm({
  mode,
  productId,
  initial,
}: {
  mode: "create" | "edit";
  productId?: string;
  initial?: ProductFormInitial;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [variants, setVariants] = useState<VariantDraft[]>(
    initial?.variants?.length ? initial.variants : [{ ...EMPTY_VARIANT, size: "M" }],
  );
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api<{ items: { id: string; name: string }[] }>("/categories")
      .then((r) => setCategories(r.items))
      .catch(() => setCategories([]));
  }, []);

  const duplicateSku = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of variants) {
      const sku = v.sku.trim().toUpperCase();
      if (sku) counts.set(sku, (counts.get(sku) ?? 0) + 1);
    }
    for (const [sku, n] of counts) {
      if (n > 1) return sku;
    }
    return null;
  }, [variants]);

  function updateVariant(index: number, patch: Partial<VariantDraft>) {
    setVariants((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setFieldErrors((e) => {
      const next = { ...e };
      delete next[`variant-${index}`];
      return next;
    });
  }

  function addVariant() {
    setVariants((rows) => [...rows, { ...EMPTY_VARIANT }]);
  }

  function removeVariant(index: number) {
    setVariants((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Product name is required.";
    variants.forEach((v, i) => {
      if (!v.size.trim()) errors[`variant-${i}`] = "Size is required.";
      else if (!v.sku.trim()) errors[`variant-${i}`] = "SKU is required.";
      else if (v.sellingPrice !== "" && Number.isNaN(Number(v.sellingPrice)))
        errors[`variant-${i}`] = "Price must be a number.";
      else if (v.sellingPrice !== "" && Number(v.sellingPrice) < 0)
        errors[`variant-${i}`] = "Price cannot be negative.";
    });
    if (duplicateSku) errors.variants = `Duplicate SKU "${duplicateSku}". Each variant needs its own SKU.`;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validate()) return;
    setPending(true);
    const payload = {
      name: name.trim(),
      categoryId: categoryId || null,
      brand: brand.trim() || null,
      description: description.trim() || null,
      variants: variants.map((v) => ({
        ...(v.id ? { id: v.id } : {}),
        size: v.size.trim(),
        colour: v.colour.trim() || null,
        sku: v.sku.trim().toUpperCase(),
        barcode: v.barcode.trim() || null,
        sellingPrice: v.sellingPrice === "" ? null : Number(v.sellingPrice),
        reorderLevel: Number(v.reorderLevel || 0),
      })),
    };
    try {
      if (mode === "create") {
        const created = await api<{ id: string }>("/products", { method: "POST", body: payload });
        toast.success("Product created", {
          description: "Stock is established via Stock In — none was added yet.",
        });
        router.replace(`/products/${created.id}`);
      } else if (productId) {
        await api(`/products/${productId}`, { method: "PATCH", body: payload });
        toast.success("Product saved");
        router.replace(`/products/${productId}`);
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.code === "DUPLICATE_SKU" || err.code === "DUPLICATE_BARCODE") {
          setFieldErrors((prev) => ({ ...prev, variants: err.message }));
        }
      } else {
        setError("We couldn't save the product. Check your internet connection and try again.");
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {mode === "create" ? "Add product" : "Edit product"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Product details live here; stock is added separately via Stock In.
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>

      {error ? <ErrorAlert title="We couldn't save the product" message={error} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Product</CardTitle>
          <CardDescription>Shared details for every variant.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="name">Name <span aria-hidden className="text-destructive">*</span></Label>
            <Input id="name" required value={name} onChange={(e) => { setName(e.target.value); setFieldErrors((p) => { const n = { ...p }; delete n.name; return n; }); }} placeholder="Classic cotton tee" aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "name-error" : undefined} />
            {fieldErrors.name ? <p id="name-error" className="text-xs text-destructive">{fieldErrors.name}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Category</Label>
            <NativeSelect id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <NativeSelectOption value="">Uncategorised</NativeSelectOption>
              {categories.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>
              ))}
            </NativeSelect>
            {categories.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No categories yet — <Link href="/categories" className="text-primary hover:underline">create one</Link>.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand">Brand</Label>
            <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Inzora" />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Fabric, fit, care notes…" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Variants</CardTitle>
            <CardDescription>One row per size/colour. SKU must be unique.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addVariant}>
            <PlusIcon aria-hidden /> Add variant
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {fieldErrors.variants ? <p role="alert" className="text-sm text-destructive">{fieldErrors.variants}</p> : null}
          <ul className="flex flex-col gap-3">
            {variants.map((v, i) => (
              <li key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3 sm:grid-cols-12 sm:items-end">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`size-${i}`}>Size *</Label>
                  <NativeSelect id={`size-${i}`} value={v.size} onChange={(e) => updateVariant(i, { size: e.target.value })}>
                    <NativeSelectOption value="">Select</NativeSelectOption>
                    {SIZES.map((s) => <NativeSelectOption key={s} value={s}>{s}</NativeSelectOption>)}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`colour-${i}`}>Colour</Label>
                  <Input id={`colour-${i}`} value={v.colour} onChange={(e) => updateVariant(i, { colour: e.target.value })} placeholder="Black" />
                </div>
                <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-2">
                  <Label htmlFor={`sku-${i}`}>SKU *</Label>
                  <Input id={`sku-${i}`} value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} placeholder="TEE-BLK-M" className="uppercase" autoCapitalize="characters" />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`barcode-${i}`}>Barcode</Label>
                  <Input id={`barcode-${i}`} inputMode="numeric" value={v.barcode} onChange={(e) => updateVariant(i, { barcode: e.target.value })} placeholder="Optional" />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`price-${i}`}>Price (RWF)</Label>
                  <Input id={`price-${i}`} inputMode="numeric" value={v.sellingPrice} onChange={(e) => updateVariant(i, { sellingPrice: e.target.value })} placeholder="15000" />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-1">
                  <Label htmlFor={`reorder-${i}`}>Reorder</Label>
                  <Input id={`reorder-${i}`} inputMode="numeric" value={v.reorderLevel} onChange={(e) => updateVariant(i, { reorderLevel: e.target.value })} />
                </div>
                <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-12">
                  {fieldErrors[`variant-${i}`] ? (
                    <p className="text-xs text-destructive">{fieldErrors[`variant-${i}`]}</p>
                  ) : <span />}
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeVariant(i)} aria-label="Remove variant" disabled={variants.length === 1}>
                    <Trash2Icon />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Save product" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
