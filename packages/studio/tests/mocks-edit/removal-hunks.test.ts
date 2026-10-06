/**
 * Removals from a text shown as a line diff: a line taken whole shows as
 * removed, a line changed inside as removed and then added as it reads now,
 * with three lines of context and both sides numbered.
 */
import { describe, expect, it } from "vitest";

import { applyEdits } from "../../src/server/mocks-edit/plan/apply-edits";
import { buildRemovalHunks } from "../../src/server/mocks-edit/removal-hunks";
import type { TextEdit } from "../../src/server/mocks-edit/types";

function hunksOf(text: string, removals: TextEdit[]) {
  return buildRemovalHunks(text, applyEdits(text, removals), removals);
}

describe("removals shown as a line diff", () => {
  it("shows a line taken whole as removed, between its context", () => {
    const text = "a\nb\nc\n";

    const hunks = hunksOf(text, [{ start: 2, end: 4, text: "" }]);

    expect(hunks).toEqual([
      {
        lines: [
          { kind: "context", text: "a", oldLine: 1, newLine: 1 },
          { kind: "remove", text: "b", oldLine: 2, newLine: null },
          { kind: "context", text: "c", oldLine: 3, newLine: 2 },
        ],
      },
    ]);
  });

  it("shows a line changed inside as it was, then as it reads now", () => {
    const text = 'import { a, b } from "x";\nuse(a);\n';
    const at = text.indexOf(", b");

    const hunks = hunksOf(text, [{ start: at, end: at + 3, text: "" }]);

    expect(hunks[0]?.lines).toEqual([
      { kind: "remove", text: 'import { a, b } from "x";', oldLine: 1, newLine: null },
      { kind: "add", text: 'import { a } from "x";', oldLine: null, newLine: 1 },
      { kind: "context", text: "use(a);", oldLine: 2, newLine: 2 },
    ]);
  });

  it("numbers the lines after several removals on both sides", () => {
    const lines = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
    const text = `${lines.join("\n")}\n`;
    const second = text.indexOf("2\n");
    const eleventh = text.indexOf("11\n");

    const hunks = hunksOf(text, [
      { start: second, end: second + 2, text: "" },
      { start: eleventh, end: eleventh + 3, text: "" },
    ]);

    expect(hunks).toHaveLength(2);
    expect(hunks[1]?.lines).toContainEqual({
      kind: "remove",
      text: "11",
      oldLine: 11,
      newLine: null,
    });
    expect(hunks[1]?.lines).toContainEqual({
      kind: "context",
      text: "12",
      oldLine: 12,
      newLine: 10,
    });
  });
});
