import { Button } from "@/design/button";
import { useStudioStore } from "@/store";
import { nextTheme, themeLabel } from "../theme-cycle";

/**
 * The theme, and a click to the next: dark, light, then the system's.
 *
 * @returns The button
 * @example
 * ```tsx
 * <ThemeButton />
 * ```
 */
export function ThemeButton(): React.ReactNode {
  const theme = useStudioStore((s) => s.theme);
  const setTheme = useStudioStore((s) => s.setTheme);
  const next = nextTheme(theme);
  return (
    <Button
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${themeLabel(theme)}. Switch to ${themeLabel(next)}`}
      className="text-small"
    >
      <span
        aria-hidden="true"
        className="size-[11px] rounded-full border-[1.5px] border-current bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]"
      />
      {themeLabel(theme)}
    </Button>
  );
}
