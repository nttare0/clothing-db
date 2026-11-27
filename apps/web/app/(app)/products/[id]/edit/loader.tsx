"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ProductForm, type ProductFormInitial } from "@/components/product-form";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorAlert } from "@/components/state";

type ProductDetail = {
  id: string;
  name: string;
  categoryId: string | null;
  brand: string | null;
  description: string | null;
  variants: {
    id: string;
    size: string;
    colour: string | null;
    sku: string;
    barcode: string | null;
    sellingPrice: string | number | null;
    reorderLevel: number;
  }[];
};

export function ProductFormLoader() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [initial, setInitial] = useState<ProductFormInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<ProductDetail>(`/products/${params.id}`)
      .then((p) => {
        if (cancelled) return;
        setInitial({
          name: p.name,
          categoryId: p.categoryId,
          brand: p.brand ?? "",
          description: p.description ?? "",
          variants: p.variants.map((v) => ({
            id: v.id,
            size: v.size,
            colour: v.colour ?? "",
            sku: v.sku,
            barcode: v.barcode ?? "",
            sellingPrice: v.sellingPrice == null ? "" : String(v.sellingPrice),
            reorderLevel: String(v.reorderLevel ?? 0),
          })),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "We couldn't load the product. Check your internet connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <ErrorAlert message={error} />
      </div>
    );
  }
  if (!initial) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return <ProductForm mode="edit" productId={params.id} initial={initial} />;
}
