import { describe, expect, it } from "vitest";

import { insertedLines } from "../../src/server/mocks-edit/inserted-lines";
import type { TextEdit } from "../../src/server/mocks-edit/types";

function numbered(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}\n`).join("");
}

function insertion(start: number, text: string): TextEdit {
  return { start, end: start, text };
}

describe("lines that are wholly new", () => {
  it("lists inserted lines by their number in the written file, each added whole", () => {
    const oldText = numbered(10);
    const at = oldText.indexOf("line 6");
    const newText = `${numbered(5)}new A\nnew B\n${oldText.slice(at)}`;

    expect(insertedLines(newText, [insertion(at, "new A\nnew B\n")])).toEqual([
      { line: 6, text: "new A", added: "new A" },
      { line: 7, text: "new B", added: "new B" },
    ]);
  });

  it("lists only the new line after a last line without a line break", () => {
    expect(insertedLines("a\nb\nc\nd\ne\nf", [insertion(9, "\nf")])).toEqual([
      { line: 6, text: "f", added: "f" },
    ]);
  });

  it("lists a line added after the final line break", () => {
    expect(insertedLines("a\nb\nc\n", [insertion(4, "c\n")])).toEqual([
      { line: 3, text: "c", added: "c" },
    ]);
  });

  it("lists lines from two insertions far apart", () => {
    const oldText = numbered(20);
    const first = oldText.indexOf("line 3\n");
    const second = oldText.indexOf("line 15\n");
    const newText = `${oldText.slice(0, first)}X\n${oldText.slice(first, second)}Y\n${oldText.slice(second)}`;

    expect(insertedLines(newText, [insertion(first, "X\n"), insertion(second, "Y\n")])).toEqual([
      { line: 3, text: "X", added: "X" },
      { line: 16, text: "Y", added: "Y" },
    ]);
  });

  it("lists every line of a new file, an empty one included", () => {
    const newText = "import a;\n\nexport default {};\n";

    expect(insertedLines(newText, [insertion(0, newText)])).toEqual([
      { line: 1, text: "import a;", added: "import a;" },
      { line: 2, text: "", added: "" },
      { line: 3, text: "export default {};", added: "export default {};" },
    ]);
  });

  it("numbers lines by CRLF and shows no carriage return", () => {
    expect(insertedLines("a\r\nx\r\nb\r\nc\r\n", [insertion(3, "x\r\n")])).toEqual([
      { line: 2, text: "x", added: "x" },
    ]);
  });

  it("cuts a long new line to 200 characters ending in an ellipsis", () => {
    const long = "x".repeat(300);
    const cut = `${"x".repeat(199)}…`;

    expect(insertedLines(`a\n${long}\n`, [insertion(2, `${long}\n`)])).toEqual([
      { line: 2, text: cut, added: cut },
    ]);
  });
});

describe("lines the user wrote that gained text", () => {
  it("names only the comma added to a line, and the line after it whole", () => {
    const oldText =
      "export default defineMocks({\n  users: defineMockServer({ source: users })\n});\n";
    const at = oldText.indexOf("\n});");
    const added = ",\n  orders: defineMockServer({ source: orders })";

    expect(
      insertedLines(oldText.slice(0, at) + added + oldText.slice(at), [insertion(at, added)]),
    ).toEqual([
      { line: 2, text: "  users: defineMockServer({ source: users }),", added: "," },
      {
        line: 3,
        text: "  orders: defineMockServer({ source: orders })",
        added: "  orders: defineMockServer({ source: orders })",
      },
    ]);
  });

  it("names only the inserted text, so removing it keeps the user's imports and mocks", () => {
    const oldText = [
      'import { defineMocks } from "@noverax/courier-mock";',
      'import courierConfig from "./courier.config";',
      "",
      "export default defineMocks({ first: 1 as never });",
      "",
    ].join("\n");
    const importAt = oldText.indexOf(" }");
    const entryAt = oldText.indexOf(" });");
    const entry = ", b: defineMockServer({ source: courierConfig.sources.api })";
    const newText =
      oldText.slice(0, importAt) +
      ", defineMockServer" +
      oldText.slice(importAt, entryAt) +
      entry +
      oldText.slice(entryAt);

    expect(
      insertedLines(newText, [
        insertion(importAt, ", defineMockServer"),
        insertion(entryAt, entry),
      ]),
    ).toEqual([
      {
        line: 1,
        text: 'import { defineMocks, defineMockServer } from "@noverax/courier-mock";',
        added: ", defineMockServer",
      },
      {
        line: 4,
        text: "export default defineMocks({ first: 1 as never, b: defineMockServer({ source: courierConfig.sources.api }) });",
        added: entry,
      },
    ]);
  });

  it("joins two insertions into one line that are apart with an ellipsis", () => {
    expect(insertedLines("f(a, x, b, y)\n", [insertion(3, ", x"), insertion(6, ", y")])).toEqual([
      { line: 1, text: "f(a, x, b, y)", added: ", x … , y" },
    ]);
  });

  it("joins two insertions at one offset without a gap", () => {
    expect(insertedLines("f(a, x, y)\n", [insertion(3, ", x"), insertion(3, ", y")])).toEqual([
      { line: 1, text: "f(a, x, y)", added: ", x, y" },
    ]);
  });

  it("does not show a byte order mark on a changed first line", () => {
    expect(insertedLines("\uFEFFa,\nb\n", [insertion(2, ",")])).toEqual([
      { line: 1, text: "a,", added: "," },
    ]);
  });

  it("says nothing was added on the halves of a line only split in two", () => {
    expect(insertedLines("a\nbc\n", [insertion(1, "\n")])).toEqual([
      { line: 1, text: "a", added: "" },
      { line: 2, text: "bc", added: "" },
    ]);
  });

  it("cuts a long inserted run to 200 characters ending in an ellipsis", () => {
    const long = "x".repeat(300);

    expect(insertedLines(`a${long}\n`, [insertion(1, long)])).toEqual([
      { line: 1, text: `a${"x".repeat(198)}…`, added: `${"x".repeat(199)}…` },
    ]);
  });
});

describe("insertions that add nothing or cannot be listed", () => {
  it("lists nothing for an empty insertion", () => {
    expect(insertedLines("a\n", [insertion(1, "")])).toEqual([]);
  });

  it("refuses insertions out of text order", () => {
    const act = () => insertedLines("xaby\n", [insertion(2, "y"), insertion(0, "x")]);

    expect(act).toThrow(expect.objectContaining({ code: "INTERNAL_PLAN_REJECTED" }));
  });
});
