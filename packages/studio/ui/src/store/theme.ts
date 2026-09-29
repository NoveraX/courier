import type { Theme } from "./types";

let mediaQueryCleanup: (() => void) | undefined;

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  // Clean up previous system theme listener
  mediaQueryCleanup?.();
  mediaQueryCleanup = undefined;

  if (theme === "system") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.removeAttribute("data-theme");
      if (!mq.matches) root.setAttribute("data-theme", "light");
    };
    apply();
    mq.addEventListener("change", apply);
    mediaQueryCleanup = () => mq.removeEventListener("change", apply);
  } else if (theme === "light") {
    root.setAttribute("data-theme", "light");
  } else {
    root.removeAttribute("data-theme");
  }
}
