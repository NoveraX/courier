import { vi } from "vitest";

/** The screen a test pretends to be: its size, and whether a finger points. */
export interface FakeScreen {
  width: number;
  height: number;
  coarse: boolean;
}

/** A phone held upright: what the responsive views are checked on. */
export const PHONE: FakeScreen = { width: 375, height: 812, coarse: true };

/* Whether one media feature, such as `(max-width: 639px)`, holds on the screen. */
function holds(feature: string, screen: FakeScreen): boolean {
  const found = /\(\s*([a-z-]+)\s*:\s*([a-z]+|[\d.]+)(?:px)?\s*\)/.exec(feature);
  if (!found) return false;
  const [, name, value] = found;
  if (name === "max-width") return screen.width <= Number(value);
  if (name === "min-width") return screen.width >= Number(value);
  if (name === "max-height") return screen.height <= Number(value);
  if (name === "pointer") return value === (screen.coarse ? "coarse" : "fine");
  return name === "hover" && value === (screen.coarse ? "none" : "hover");
}

/**
 * Whether a media query matches on a screen: one of its comma-separated
 * queries does, each feature of it joined by `and` holding.
 *
 * @param query - The media query
 * @param screen - The screen
 * @returns Whether it matches
 */
export function matchesOn(query: string, screen: FakeScreen): boolean {
  return query
    .split(",")
    .some((alternative) =>
      alternative.split(/\band\b/).every((feature) => holds(feature.trim(), screen)),
    );
}

/**
 * Make the page the screen for the tests that follow: `matchMedia` answers
 * as that screen's would, and every element is as wide as the screen —
 * jsdom lays nothing out, so a list measures what this says. Undone by
 * `vi.unstubAllGlobals()` and the returned function.
 *
 * @param screen - The screen to be
 * @returns What puts the element widths back
 */
export function actAsScreen(screen: FakeScreen): () => void {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: matchesOn(media, screen),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const before = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => screen.width,
  });
  return () => {
    if (before) Object.defineProperty(HTMLElement.prototype, "clientWidth", before);
  };
}
