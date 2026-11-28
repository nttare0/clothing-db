import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to ClothFlow — the private system for clothing store staff. Catalogue, stock, point of sale, returns and reporting. Accounts are created by the store owner.",
  robots: { index: true, follow: true },
};

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
