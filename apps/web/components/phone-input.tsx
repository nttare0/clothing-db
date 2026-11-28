"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatPhoneInput } from "@/lib/phone";

type PhoneInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type" | "inputMode"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * Phone field that auto-formats as you type:
 * "0788…" becomes "+250 788 …", "+" is always kept, and any other country code can be typed freely.
 */
export function PhoneInput({ value, onValueChange, placeholder = "+250 788 000 000", ...rest }: PhoneInputProps) {
  return (
    <Input
      {...rest}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onValueChange(formatPhoneInput(event.target.value))}
    />
  );
}
