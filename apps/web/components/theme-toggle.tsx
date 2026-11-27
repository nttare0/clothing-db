"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon, MonitorIcon, CheckIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS: { id: "light" | "dark" | "system"; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "light", label: "Light", hint: "Always bright", icon: SunIcon },
  { id: "dark", label: "Dark", hint: "Easy on the eyes", icon: MoonIcon },
  { id: "system", label: "Device default", hint: "Match this device's setting", icon: MonitorIcon },
];

/** Plain-language theme picker for the top bar: Light / Dark / Device default. */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  // Server/first paint renders a stable placeholder; after hydration this flips to true.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Render a stable placeholder until mounted — the real icon differs per theme.
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label="Change theme" className="text-muted-foreground">
        <SunIcon className="size-5" aria-hidden />
      </Button>
    );
  }

  const current = theme ?? "system";
  const TriggerIcon = current === "light" || (current === "system" && resolvedTheme === "light") ? SunIcon : current === "dark" || resolvedTheme === "dark" ? MoonIcon : MonitorIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Change theme" className="text-muted-foreground hover:text-foreground">
            <TriggerIcon className="size-5" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        </DropdownMenuGroup>
        {OPTIONS.map(({ id, label, hint, icon: Icon }) => {
          const active = current === id;
          return (
            <DropdownMenuItem
              key={id}
              onClick={() => setTheme(id)}
              aria-current={active ? "true" : undefined}
              className="gap-2.5"
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium leading-tight">{label}</span>
                <span className="text-[10px] leading-tight text-muted-foreground">{hint}</span>
              </span>
              {active ? <CheckIcon className="ml-auto size-4 text-primary" aria-hidden /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
