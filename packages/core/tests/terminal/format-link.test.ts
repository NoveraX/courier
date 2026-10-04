/**
 * An address in a banner: its port in bold, its fragment dimmed, and its
 * text unchanged, so it is copied and opened whole.
 */
import { describe, expect, it } from "vitest";

import { formatLink } from "../../src/terminal/format-link";
import { createTerminalStyle } from "../../src/terminal/terminal-style";

// biome-ignore lint/suspicious/noControlCharactersInRegex: it matches the ESC that starts a terminal colour
const ESCAPE = /\x1b\[[\d;]*m/g;
const style = createTerminalStyle(24, true);

describe("formatLink", () => {
  it("bolds the port and dims the fragment", () => {
    const link = formatLink("http://localhost:6280/#token=k3y", style);

    expect(link).toContain("\x1b[1m6280\x1b[22m");
    expect(link).toContain("\x1b[2m#token=k3y\x1b[22m");
  });

  it("keeps the text of every address whole", () => {
    for (const url of [
      "http://localhost:6280/#token=k3y",
      "http://[2001:db8::5]:6280",
      "http://192.0.2.10",
      "https://studio.example.com/path?q=1#x",
    ]) {
      expect(formatLink(url, style).replace(ESCAPE, "")).toBe(url);
    }
  });

  it("finds the port after a bracketed IPv6 address", () => {
    expect(formatLink("http://[2001:db8::5]:6280", style)).toContain("\x1b[1m6280\x1b[22m");
  });
});
