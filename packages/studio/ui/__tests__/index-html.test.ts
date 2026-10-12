/**
 * Studio's page on a phone: it is laid out at the screen's own width and
 * scale, draws under a notch and a home indicator — the shell keeps its
 * bars clear of them — shrinks its layout over an on-screen keyboard, and
 * gives the browser's bars the default theme's ground before any script
 * runs.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { THEME_GROUND } from "@/store/theme";

const PAGE = readFileSync(join(import.meta.dirname, "../index.html"), "utf8");

function metaContent(name: string): string | undefined {
  const tag = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, "s").exec(PAGE);
  return tag?.[1];
}

describe("Studio's page", () => {
  it("fits a phone's screen, under its notch and over its keyboard", () => {
    const viewport = metaContent("viewport")?.split(/,\s*/);

    expect(viewport).toEqual([
      "width=device-width",
      "initial-scale=1",
      "viewport-fit=cover",
      "interactive-widget=resizes-content",
    ]);
  });

  it("gives the browser's bars the default theme's ground before the page runs", () => {
    expect(metaContent("theme-color")).toBe(THEME_GROUND.dark);
  });
});
