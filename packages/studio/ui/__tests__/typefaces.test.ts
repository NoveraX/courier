/**
 * Studio's typefaces ship with it. Fetched from a font host when a page
 * opened, they left a Studio offline or behind a firewall in its fallback
 * faces, and told a third party of every page Studio served.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const UI = join(import.meta.dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("Studio's typefaces", () => {
  it("are bundled: the entry imports both Geist faces", () => {
    const entry = readFileSync(join(UI, "src/main.tsx"), "utf8");

    expect(entry).toContain('import "@fontsource-variable/geist";');
    expect(entry).toContain('import "@fontsource-variable/geist-mono";');
  });

  it("come from no other host: neither the page nor any source names one", () => {
    const page = readFileSync(join(UI, "index.html"), "utf8");
    const named = sourceFiles(join(UI, "src")).filter((file) =>
      /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(file, "utf8")),
    );

    expect(page).not.toMatch(/<(link|script)[^>]+(href|src)="https?:/);
    expect(named).toEqual([]);
  });
});
