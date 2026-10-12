/**
 * @vitest-environment jsdom
 *
 * A theme shown on the page is given to the browser's own bars too — a
 * phone's status bar, the address bar — in the page's ground, as the
 * design's tokens set it; the system's theme is followed as it changes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyTheme, THEME_GROUND } from "@/store/theme";

const TOKENS = readFileSync(join(import.meta.dirname, "../src/design/tokens.css"), "utf8");

function groundIn(block: string): string | undefined {
  return /--color-bg:\s*(#[0-9a-f]{6});/i.exec(block)?.[1];
}

/* The system's theme, which a test turns dark or light. */
function fakeSystem(dark: boolean): { set: (next: boolean) => void } {
  let matches = dark;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    get matches() {
      return matches;
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    set(next) {
      matches = next;
      for (const listener of listeners) listener();
    },
  };
}

const themeColor = (): string | null =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null;

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#08090a" />';
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  applyTheme("dark");
  vi.unstubAllGlobals();
});

describe("applyTheme", () => {
  it("gives the browser's bars each theme's ground, as the design's tokens set it", () => {
    const [dark, light] = TOKENS.split(':root[data-theme="light"]');

    expect(groundIn(dark ?? "")).toBe(THEME_GROUND.dark);
    expect(groundIn(light ?? "")).toBe(THEME_GROUND.light);
  });

  it("shows a theme chosen, on the page and in the browser's bars", () => {
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(themeColor()).toBe(THEME_GROUND.light);

    applyTheme("dark");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(themeColor()).toBe(THEME_GROUND.dark);
  });

  it("follows the system's theme as it changes, until another theme is chosen", () => {
    const system = fakeSystem(false);
    applyTheme("system");
    expect(themeColor()).toBe(THEME_GROUND.light);

    system.set(true);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(themeColor()).toBe(THEME_GROUND.dark);

    applyTheme("light");
    system.set(true);
    expect(themeColor()).toBe(THEME_GROUND.light);
  });

  it("takes the system's theme to be dark where the page cannot ask", () => {
    vi.stubGlobal("matchMedia", undefined);

    applyTheme("system");

    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(themeColor()).toBe(THEME_GROUND.dark);
  });
});
