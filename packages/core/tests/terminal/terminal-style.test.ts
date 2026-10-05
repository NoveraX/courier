/**
 * The style a stream's colour level gives: nothing at all without colour;
 * otherwise the terminal's own 16 status colours, the brand blue in the
 * richest form the terminal shows, and nested styles that keep the outer
 * one after the inner closes.
 */
import { describe, expect, it } from "vitest";

import { createTerminalStyle } from "../../src/terminal/terminal-style";

describe("createTerminalStyle", () => {
  it("writes no escape code at level 0", () => {
    const style = createTerminalStyle(0, true);

    expect(style.bold(style.brand(style.red("text")))).toBe("text");
  });

  it("paints the brand blue in the richest form the terminal shows", () => {
    expect(createTerminalStyle(24, true).brand("C")).toBe("\x1b[38;2;46;116;234mC\x1b[39m");
    expect(createTerminalStyle(8, true).brand("C")).toBe("\x1b[38;5;33mC\x1b[39m");
    expect(createTerminalStyle(4, true).brand("C")).toBe("\x1b[34mC\x1b[39m");
  });

  it("uses the terminal's own colours for status, at every level", () => {
    expect(createTerminalStyle(24, true).green("200")).toBe("\x1b[32m200\x1b[39m");
  });

  it("re-opens an outer style after an inner one closes with the same code", () => {
    const { dim, bold, cyan, red } = createTerminalStyle(24, true);

    expect(dim(`a ${bold("b")} c`)).toBe("\x1b[2ma \x1b[1mb\x1b[22m\x1b[2m c\x1b[22m");
    expect(cyan(`a ${red("b")} c`)).toBe("\x1b[36ma \x1b[31mb\x1b[39m\x1b[36m c\x1b[39m");
  });

  it("gives the symbols the terminal draws, or their ASCII stand-ins", () => {
    expect(createTerminalStyle(24, true).glyphs.warn).toBe("▲");
    expect(createTerminalStyle(24, false).glyphs.warn).toBe("!");
  });

  it("is the same object for the same level and symbols", () => {
    expect(createTerminalStyle(8, true)).toBe(createTerminalStyle(8, true));
  });
});
