import { describe, expect, it } from "vitest";

import { textDiffHunks } from "../../src/server/mocks-edit/text-diff-hunks";

const lines = (text: string) =>
  textDiffHunks(...(text.split("|") as [string, string])).flatMap((hunk) =>
    hunk.lines.map(
      (line) => `${line.kind[0]}${line.oldLine ?? "-"}:${line.newLine ?? "-"} ${line.text}`,
    ),
  );

describe("a line diff between two texts", () => {
  it("shows a replaced line removed and added, numbered on each side, within three lines of context", () => {
    expect(lines("a\nb\nc\nd\ne\nf\ng\nh\n|a\nb\nc\nd\nE\nf\ng\nh\n")).toEqual([
      "c2:2 b",
      "c3:3 c",
      "c4:4 d",
      "r5:- e",
      "a-:5 E",
      "c6:6 f",
      "c7:7 g",
      "c8:8 h",
    ]);
  });

  it("matches the lines between two changes by their longest common run", () => {
    expect(lines("x\na\nb\nc\ny\n|a\nb\nZ\nc\n")).toEqual([
      "r1:- x",
      "c2:1 a",
      "c3:2 b",
      "a-:3 Z",
      "c4:4 c",
      "r5:- y",
    ]);
  });

  it("splits changes far apart into hunks of their own, and shows nothing for equal texts", () => {
    const before = Array.from({ length: 20 }, (_, index) => `line ${index}`).join("\n");
    const after = before.replace("line 1\n", "one\n").replace("line 18", "eighteen");

    expect(textDiffHunks(before, after)).toHaveLength(2);
    expect(textDiffHunks(before, before)).toEqual([]);
  });

  it("reads CRLF lines as their text alone", () => {
    expect(lines("a\r\nb\r\n|a\r\nB\r\n")).toEqual(["c1:1 a", "r2:- b", "a-:2 B"]);
  });
});
