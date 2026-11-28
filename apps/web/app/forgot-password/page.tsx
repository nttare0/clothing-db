import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot your password",
  description:
    "Reset your ClothFlow password. Enter the email your store owner used to create your account and we will send you a reset link that works for 30 minutes.",
  robots: { index: true, follow: true },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
