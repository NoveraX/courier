/**
 * A command's banner: the product and version, how long it took to be
 * ready, one row per address or file under a shared column, a note, and the
 * problems met on the way — with no escape code at all without colour.
 */
import { describe, expect, it } from "vitest";

import { formatBanner } from "../../src/terminal/format-banner";
import { createTerminalStyle } from "../../src/terminal/terminal-style";

// biome-ignore lint/suspicious/noControlCharactersInRegex: it matches the ESC that starts a terminal colour
const ESCAPE = /\x1b\[[\d;]*m/g;
const plain = createTerminalStyle(0, true);

const banner = {
  product: "Courier Studio",
  version: "1.2.3",
  rows: [
    { label: "Local", value: "http://localhost:6280" },
    { label: "Network", value: "http://192.0.2.10:6280" },
  ],
};

describe("formatBanner", () => {
  it("names the product and its version, with a blank line above and below", () => {
    const lines = formatBanner(banner, plain).split("\n");

    expect(lines[0]).toBe("");
    expect(lines[1]).toBe("  Courier Studio v1.2.3");
    expect(lines.at(-1)).toBe("");
  });

  it("says how long it took to be ready, in ms or in seconds", () => {
    expect(formatBanner({ ...banner, readyInMs: 412.4 }, plain)).toContain("ready in 412 ms");
    expect(formatBanner({ ...banner, readyInMs: 1840 }, plain)).toContain("ready in 1.8 s");
  });

  it("starts every row's value in one column", () => {
    const text = formatBanner(banner, plain);

    expect(text).toContain("➜  Local     http://localhost:6280");
    expect(text).toContain("➜  Network   http://192.0.2.10:6280");
  });

  it("widens the column for a longer label", () => {
    const text = formatBanner(
      { ...banner, rows: [{ label: "Configuration", value: "a.ts" }] },
      plain,
    );

    expect(text).toContain("Configuration  a.ts");
  });

  it("restates each problem under the note", () => {
    const text = formatBanner({ ...banner, note: "A note.", issues: ["Config failed"] }, plain);

    expect(text.indexOf("A note.")).toBeLessThan(text.indexOf("▲  Config failed"));
  });

  it("writes no escape code without colour, and the same text with it", () => {
    const full = { ...banner, readyInMs: 90, note: "A note.", issues: ["Config failed"] };
    const coloured = formatBanner(full, createTerminalStyle(24, true));

    expect(formatBanner(full, plain)).not.toMatch(ESCAPE);
    expect(coloured).toMatch(ESCAPE);
    expect(coloured.replace(ESCAPE, "")).toBe(formatBanner(full, plain));
  });

  it("uses ASCII stand-ins where the terminal draws no symbols", () => {
    const text = formatBanner(
      { ...banner, issues: ["Config failed"] },
      createTerminalStyle(0, false),
    );

    expect(text).toContain(">  Local");
    expect(text).toContain("!  Config failed");
  });
});
