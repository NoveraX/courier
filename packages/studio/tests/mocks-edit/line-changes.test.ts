import { describe, expect, it } from "vitest";

import { findLineChanges } from "../../src/server/mocks-edit/line-changes";
import { MocksEditRefusal } from "../../src/server/mocks-edit/mocks-edit-refusal";
import { splitLines } from "../../src/server/mocks-edit/split-lines";
import type { TextEdit } from "../../src/server/mocks-edit/types";

function changes(
  oldText: string,
  newText: string,
  edits: TextEdit[],
): ReturnType<typeof findLineChanges> {
  return findLineChanges(splitLines(oldText), splitLines(newText), edits);
}

describe("working out what insertions did to each line", () => {
  it("keeps the old line after a line inserted before it", () => {
    expect(changes("a\nb\n", "a\nx\nb\n", [{ start: 2, end: 2, text: "x\n" }])).toEqual([
      { oldIndex: 1, hasOldLine: true, newFirst: 1, newLast: 2, keptIndex: 2 },
    ]);
  });

  it("keeps the old line before a line inserted after it", () => {
    expect(changes("a\nb\n", "a\nx\nb\n", [{ start: 1, end: 1, text: "\nx" }])).toEqual([
      { oldIndex: 0, hasOldLine: true, newFirst: 0, newLast: 1, keptIndex: 0 },
    ]);
  });

  it("keeps no line that text was inserted into", () => {
    expect(changes("a\n", "a,\n", [{ start: 1, end: 1, text: "," }])).toEqual([
      { oldIndex: 0, hasOldLine: true, newFirst: 0, newLast: 0, keptIndex: null },
    ]);
  });

  it("keeps an empty old line after a line inserted before it", () => {
    expect(changes("a\n\nb\n", "a\nx\n\nb\n", [{ start: 2, end: 2, text: "x\n" }])).toEqual([
      { oldIndex: 1, hasOldLine: true, newFirst: 1, newLast: 2, keptIndex: 2 },
    ]);
  });

  it("names no old line for text appended after the final line break", () => {
    expect(changes("a\n", "a\nb\nc\n", [{ start: 2, end: 2, text: "b\nc\n" }])).toEqual([
      { oldIndex: 1, hasOldLine: false, newFirst: 1, newLast: 2, keptIndex: null },
    ]);
  });

  it("groups insertions that fall on one old line", () => {
    const edits = [
      { start: 0, end: 0, text: "x\n" },
      { start: 1, end: 1, text: "\ny" },
    ];

    expect(changes("a\nb\n", "x\na\ny\nb\n", edits)).toEqual([
      { oldIndex: 0, hasOldLine: true, newFirst: 0, newLast: 2, keptIndex: 1 },
    ]);
  });

  it("follows the lines of earlier insertions to place later ones", () => {
    const edits = [
      { start: 0, end: 0, text: "x\ny\n" },
      { start: 3, end: 3, text: "," },
    ];

    expect(changes("a\nb\nc\n", "x\ny\na\nb,\nc\n", edits)).toEqual([
      { oldIndex: 0, hasOldLine: true, newFirst: 0, newLast: 2, keptIndex: 2 },
      { oldIndex: 1, hasOldLine: true, newFirst: 3, newLast: 3, keptIndex: null },
    ]);
  });

  it("ignores an empty insertion", () => {
    expect(changes("a\n", "a\n", [{ start: 1, end: 1, text: "" }])).toEqual([]);
  });

  it("refuses an edit that replaces text", () => {
    const act = () => changes("ab\n", "xb\n", [{ start: 0, end: 1, text: "x" }]);

    expect(act).toThrow(MocksEditRefusal);
    expect(act).toThrow(
      expect.objectContaining({
        code: "INTERNAL_PLAN_REJECTED",
        message: "The planned edit is not a list of insertions in text order",
      }),
    );
  });

  it("refuses insertions out of text order", () => {
    const edits = [
      { start: 2, end: 2, text: "y" },
      { start: 0, end: 0, text: "x" },
    ];

    expect(() => changes("ab\n", "xayb\n", edits)).toThrow(
      expect.objectContaining({ code: "INTERNAL_PLAN_REJECTED" }),
    );
  });
});
