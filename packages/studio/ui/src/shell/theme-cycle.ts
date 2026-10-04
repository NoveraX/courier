import type { Theme } from "@/store";

const NEXT: Readonly<Record<Theme, Theme>> = { dark: "light", light: "system", system: "dark" };
const LABEL: Readonly<Record<Theme, string>> = { dark: "Dark", light: "Light", system: "Auto" };

/**
 * The theme after this one: dark, light, then the system's.
 *
 * @param theme - The current theme
 * @returns The next one
 * @example
 * ```ts
 * nextTheme("dark"); // "light"
 * ```
 */
export function nextTheme(theme: Theme): Theme {
  return NEXT[theme];
}

/**
 * A theme's name as Studio shows it: `Auto` for the system's.
 *
 * @param theme - A theme
 * @returns Its name
 * @example
 * ```ts
 * themeLabel("system"); // "Auto"
 * ```
 */
export function themeLabel(theme: Theme): string {
  return LABEL[theme];
}
