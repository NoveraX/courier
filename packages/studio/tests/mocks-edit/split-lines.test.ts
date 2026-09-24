import { describe, expect, it } from "vitest";

import { splitLines } from "../../src/server/mocks-edit/split-lines";

describe("splitting a text into lines", () => {
  it("returns no lines for an empty text", () => {
    expect(splitLines("")).toEqual([]);
  });

  it("returns a last line without a line break", () => {
    expect(splitLines("a\nbc")).toEqual([
      { start: 0, contentEnd: 1, end: 2 },
      { start: 2, contentEnd: 4, end: 4 },
    ]);
  });

  it("adds no empty line after a final line break", () => {
    expect(splitLines("a\n")).toEqual([{ start: 0, contentEnd: 1, end: 2 }]);
  });

  it("keeps empty lines between line breaks", () => {
    expect(splitLines("\n\n")).toEqual([
      { start: 0, contentEnd: 0, end: 1 },
      { start: 1, contentEnd: 1, end: 2 },
    ]);
  });

  it("leaves a CRLF's carriage return out of the line's text", () => {
    expect(splitLines("a\r\nb\r\n")).toEqual([
      { start: 0, contentEnd: 1, end: 3 },
      { start: 3, contentEnd: 4, end: 6 },
    ]);
  });

  it("breaks a line at a lone carriage return, as the planner numbers it", () => {
    expect(splitLines("a\rb\n")).toEqual([
      { start: 0, contentEnd: 1, end: 2 },
      { start: 2, contentEnd: 3, end: 4 },
    ]);
  });

  it("breaks a line at U+2028 and U+2029", () => {
    expect(splitLines("a\u2028b\u2029c")).toEqual([
      { start: 0, contentEnd: 1, end: 2 },
      { start: 2, contentEnd: 3, end: 4 },
      { start: 4, contentEnd: 5, end: 5 },
    ]);
  });

  it("counts CR then LF as one line break, and LF then CR as two", () => {
    expect(splitLines("a\r\n\n\rb")).toEqual([
      { start: 0, contentEnd: 1, end: 3 },
      { start: 3, contentEnd: 3, end: 4 },
      { start: 4, contentEnd: 4, end: 5 },
      { start: 5, contentEnd: 6, end: 6 },
    ]);
  });
});
