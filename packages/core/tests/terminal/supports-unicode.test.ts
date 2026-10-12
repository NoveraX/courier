/**
 * Whether a terminal draws Courier's symbols: everywhere but the Linux
 * kernel console, and on Windows only in the terminals known to.
 */
import { describe, expect, it, vi } from "vitest";

import { supportsUnicode } from "../../src/terminal/supports-unicode";

describe("supportsUnicode", () => {
  it("is true on macOS and Linux, but not on the Linux kernel's console", () => {
    expect(supportsUnicode({ TERM: "xterm-256color" }, "darwin")).toBe(true);
    expect(supportsUnicode({}, "linux")).toBe(true);
    expect(supportsUnicode({ TERM: "linux" }, "linux")).toBe(false);
  });

  it("is true where there is no platform to ask, as in an edge runtime", () => {
    /* No process at all: an explicit undefined would take the host's own platform. */
    vi.stubGlobal("process", undefined);
    let answer: boolean;
    try {
      answer = supportsUnicode();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(answer).toBe(true);
  });

  it("is true on Windows only in a terminal known to draw the symbols", () => {
    expect(supportsUnicode({}, "win32")).toBe(false);
    expect(supportsUnicode({ WT_SESSION: "7f3a" }, "win32")).toBe(true);
    expect(supportsUnicode({ TERM_PROGRAM: "vscode" }, "win32")).toBe(true);
    expect(supportsUnicode({ TERMINAL_EMULATOR: "JetBrains-JediTerm" }, "win32")).toBe(true);
  });
});
