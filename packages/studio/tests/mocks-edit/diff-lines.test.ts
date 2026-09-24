import { describe, expect, it } from "vitest";

import { diffLines } from "../../src/server/mocks-edit/diff-lines";
import { splitLines } from "../../src/server/mocks-edit/split-lines";

function lined(text: string): { text: string; lines: ReturnType<typeof splitLines> } {
  return { text, lines: splitLines(text) };
}

describe("laying out a whole text as a line diff", () => {
  it("shows every unchanged line as context, numbered on both sides", () => {
    expect(diffLines(lined("a\nb\n"), lined("a\nb\n"), [])).toEqual([
      { kind: "context", text: "a", oldLine: 1, newLine: 1 },
      { kind: "context", text: "b", oldLine: 2, newLine: 2 },
    ]);
  });

  it("numbers the lines after a change further on in the new text", () => {
    const change = { oldIndex: 1, hasOldLine: true, newFirst: 1, newLast: 2, keptIndex: 2 };

    expect(diffLines(lined("a\nb\nc\n"), lined("a\nx\nb\nc\n"), [change])).toEqual([
      { kind: "context", text: "a", oldLine: 1, newLine: 1 },
      { kind: "add", text: "x", oldLine: null, newLine: 2 },
      { kind: "context", text: "b", oldLine: 2, newLine: 3 },
      { kind: "context", text: "c", oldLine: 3, newLine: 4 },
    ]);
  });

  it("shows an old line that did not survive whole as removed before what it became", () => {
    const change = { oldIndex: 0, hasOldLine: true, newFirst: 0, newLast: 1, keptIndex: null };

    expect(diffLines(lined("a\nc\n"), lined("a,\nb\nc\n"), [change])).toEqual([
      { kind: "remove", text: "a", oldLine: 1, newLine: null },
      { kind: "add", text: "a,", oldLine: null, newLine: 1 },
      { kind: "add", text: "b", oldLine: null, newLine: 2 },
      { kind: "context", text: "c", oldLine: 2, newLine: 3 },
    ]);
  });
});
