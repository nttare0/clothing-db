"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchInputProps = {
  /** Current query text (controlled). */
  value: string;
  /** Called with the raw input value on every keystroke. */
  onChange: (value: string) => void;
  /** Placeholder shown when empty. */
  placeholder: string;
  /** Accessible name for the field. */
  ariaLabel: string;
  /** Extra classes on the outer wrapper (e.g. "flex-1"). */
  className?: string;
  /** Extra classes on the input itself (e.g. "h-12 text-base"). */
  inputClassName?: string;
  /** Large variant for primary counters (POS): bigger field, bigger icon. */
  size?: "default" | "lg";
  inputRef?: React.Ref<HTMLInputElement>;
  autoFocus?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  id?: string;
  autoComplete?: string;
  /** Called when the clear (×) button is pressed; defaults to onChange(""). */
  onClear?: () => void;
};

/**
 * Shared search field: leading magnifier, keyboard-friendly, and a clear
 * button whenever there is text. Used by every list/search screen so the
 * experience is identical everywhere.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
  size = "default",
  inputRef,
  autoFocus,
  onKeyDown,
  id,
  autoComplete = "off",
  onClear,
}: SearchInputProps) {
  const large = size === "lg";
  const clear = () => {
    if (onClear) onClear();
    else onChange("");
  };
  return (
    <div className={cn("relative", className)}>
      <SearchIcon
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
          large ? "left-3.5 size-5" : "left-3 size-4",
        )}
        aria-hidden
      />
      <Input
        id={id}
        ref={inputRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={cn(
          large ? "h-12 pl-11 text-base" : "pl-9",
          value ? (large ? "pr-12" : "pr-9") : undefined,
          inputClassName,
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className={cn(
            "absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            large ? "right-1.5 size-9" : "right-1 size-7",
          )}
        >
          <XIcon className={large ? "size-5" : "size-4"} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
