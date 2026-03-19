import type { DensityMode } from "./types";

/**
 * Applies density mode to the root element.
 * Compact mode reduces padding, gaps, row heights via CSS variables.
 */
export function applyDensity(mode: DensityMode): void {
  const root = document.documentElement;
  if (mode === "compact") {
    root.setAttribute("data-density", "compact");
  } else {
    root.removeAttribute("data-density");
  }
}
