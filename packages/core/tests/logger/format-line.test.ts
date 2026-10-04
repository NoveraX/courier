/**
 * One terminal log line: time, level, `courier:` and the scope in a column,
 * then the message. Without colour the level is a word; with it, a symbol
 * in the level's colour, a request line tinted, and a debug line dimmed
 * whole.
 */
import { describe, expect, it } from "vitest";

import { formatLine } from "../../src/logger/format-line";
import { createTerminalStyle } from "../../src/terminal/terminal-style";

// biome-ignore lint/suspicious/noControlCharactersInRegex: it matches the ESC that starts a terminal colour
const ESCAPE = /\x1b\[[\d;]*m/g;
const plain = createTerminalStyle(0, true);
const coloured = createTerminalStyle(24, true);

describe("formatLine", () => {
  it("names the level in words without colour", () => {
    expect(formatLine("debug", "Studio", "m", plain)).toMatch(
      /^\d\d:\d\d:\d\d DEBUG courier:studio /,
    );
    expect(formatLine("info", "Studio", "m", plain)).toMatch(/ INFO {2}courier:studio /);
    expect(formatLine("error", "Studio", "m", plain)).toMatch(/ ERROR courier:studio /);
  });

  it("starts the messages of different scopes in one column", () => {
    const short = formatLine("info", "WS", "here", plain);
    const long = formatLine("info", "MockScenario", "here", plain);

    expect(short.indexOf("here")).toBe(long.indexOf("here"));
  });

  it("marks each level with its own symbol where there is colour", () => {
    const marks = (["debug", "info", "warn", "error"] as const).map(
      (level) => formatLine(level, "Studio", "m", coloured).replace(ESCAPE, "").split(" ")[1],
    );

    expect(marks).toEqual(["·", "●", "▲", "✕"]);
  });

  it("dims a debug line whole", () => {
    const line = formatLine("debug", "Studio", "detail", coloured);

    expect(line.startsWith("\x1b[2m")).toBe(true);
    expect(line.endsWith("detail\x1b[22m")).toBe(true);
  });

  it("tints a request line at info, and only there", () => {
    const info = formatLine("info", "MockServer", "GET /a → 404 (1ms)", coloured);
    const warn = formatLine("warn", "MockServer", "GET /a → 404 (1ms)", coloured);

    expect(info).toContain("\x1b[31m404\x1b[39m");
    expect(warn).toContain("GET /a → 404 (1ms)");
  });

  it("keeps the same text with colour as without, but for the level's symbol", () => {
    /* The time is left out: the two lines may fall either side of a second. */
    const withColour = formatLine("info", "Studio", "loaded", coloured)
      .replace(ESCAPE, "")
      .slice(8);
    const without = formatLine("info", "Studio", "loaded", plain).slice(8);

    expect(withColour.replace(" ● ", " INFO  ")).toBe(without);
  });
});
