import type { Theme } from "./types";

/**
 * The page's ground in each theme — `--color-bg` in `design/tokens.css` — which
 * the browser also gives its own bars: a phone's status bar, the address bar.
 */
export const THEME_GROUND = { dark: "#08090a", light: "#fbfbfa" } as const;

let mediaQueryCleanup: (() => void) | undefined;

function show(root: HTMLElement, look: keyof typeof THEME_GROUND): void {
  if (look === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_GROUND[look];
}

/**
 * Show the page in a theme — the system's followed as it changes, until
 * another theme is shown — and give the browser's own bars its ground.
 * Without `matchMedia` the system's theme is taken to be dark, Studio's own.
 *
 * @param theme - Dark, light, or the system's
 * @example
 * ```ts
 * applyTheme("system");
 * ```
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  mediaQueryCleanup?.();
  mediaQueryCleanup = undefined;
  if (theme !== "system") {
    show(root, theme);
    return;
  }
  if (typeof window.matchMedia !== "function") {
    show(root, "dark");
    return;
  }
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = (): void => show(root, mq.matches ? "dark" : "light");
  apply();
  mq.addEventListener("change", apply);
  mediaQueryCleanup = () => mq.removeEventListener("change", apply);
}
