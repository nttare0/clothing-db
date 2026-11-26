import type { Metadata } from "next";
import { ProductFormLoader } from "./loader";

export const metadata: Metadata = { title: "Edit product" };

export default function EditProductPage() {
  return <ProductFormLoader />;
}
