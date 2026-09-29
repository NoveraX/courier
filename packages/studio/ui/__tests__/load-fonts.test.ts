/**
 * @vitest-environment jsdom
 *
 * Studio's typefaces come from a font host. Linked from the page's head,
 * their stylesheet held the first render until it arrived, and with the host
 * unreachable Studio stayed blank for about 30 seconds.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadFonts } from "../src/lib/load-fonts";

describe("Studio's typefaces", () => {
  it("are not a stylesheet the page waits for", () => {
    const page = readFileSync(join(import.meta.dirname, "../index.html"), "utf8");

    expect(page).not.toMatch(/<link[^>]*rel="stylesheet"/);
  });

  it("are asked for once the app starts, and once only", () => {
    loadFonts(document);
    loadFonts(document);

    const links = document.head.querySelectorAll('link[rel="stylesheet"]');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toContain("family=Geist");
  });
});
