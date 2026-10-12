import { SunMoon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { nextTheme, themeLabel } from "../theme-cycle";
import { NAV_ROW } from "./nav-row";

/**
 * The navigation drawer's theme, a row like the views', and a tap to the
 * next: dark, light, then the system's. On a phone the header has no room
 * for its own theme button.
 *
 * @returns The row
 * @example
 * ```tsx
 * <ThemeRow />
 * ```
 */
export function ThemeRow(): React.ReactNode {
  const theme = useStudioStore((s) => s.theme);
  const setTheme = useStudioStore((s) => s.setTheme);
  const next = nextTheme(theme);
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${themeLabel(theme)}. Switch to ${themeLabel(next)}`}
      className={cn(
        NAV_ROW,
        "w-full cursor-pointer text-left text-fg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
      )}
    >
      <SunMoon aria-hidden="true" className="size-3.75 shrink-0 opacity-85" />
      <span>Theme</span>
      <span className="flex-1" />
      <span className="text-fg-subtle">{themeLabel(theme)}</span>
    </button>
  );
}
