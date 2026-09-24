import { describe, expect, it } from "vitest";

import { buildDiffHunks } from "../../src/server/mocks-edit/diff-hunks";
import { MocksEditRefusal } from "../../src/server/mocks-edit/mocks-edit-refusal";
import type { DiffLine, TextEdit } from "../../src/server/mocks-edit/types";

function numbered(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}\n`).join("");
}

function insertion(start: number, text: string): TextEdit {
  return { start, end: start, text };
}

function context(text: string, oldLine: number, newLine: number): DiffLine {
  return { kind: "context", text, oldLine, newLine };
}

function add(text: string, newLine: number): DiffLine {
  return { kind: "add", text, oldLine: null, newLine };
}

function remove(text: string, oldLine: number): DiffLine {
  return { kind: "remove", text, oldLine, newLine: null };
}

describe("an insertion in the middle of a file", () => {
  const oldText = numbered(10);
  const at = oldText.indexOf("line 6");
  const edits = [insertion(at, "new A\nnew B\n")];
  const newText = `${numbered(5)}new A\nnew B\n${oldText.slice(at)}`;

  it("shows the inserted lines as added between three lines of context on each side", () => {
    expect(buildDiffHunks(oldText, newText, edits)).toEqual([
      {
        lines: [
          context("line 3", 3, 3),
          context("line 4", 4, 4),
          context("line 5", 5, 5),
          add("new A", 6),
          add("new B", 7),
          context("line 6", 6, 8),
          context("line 7", 7, 9),
          context("line 8", 8, 10),
        ],
      },
    ]);
  });
});

describe("a mock added inside defineMocks", () => {
  const oldText = [
    'import { defineMocks, defineMockServer } from "@noverax/courier-mock";',
    'import { users } from "./src/users";',
    "",
    "export default defineMocks({",
    "  users: defineMockServer({ source: users }),",
    "});",
    "",
  ].join("\n");
  const at = oldText.indexOf("});");
  const added = "  orders: defineMockServer({ source: orders }),\n";
  const newText = oldText.slice(0, at) + added + oldText.slice(at);

  it("keeps the closing line as context after the added property", () => {
    expect(buildDiffHunks(oldText, newText, [insertion(at, added)])).toEqual([
      {
        lines: [
          context("", 3, 3),
          context("export default defineMocks({", 4, 4),
          context("  users: defineMockServer({ source: users }),", 5, 5),
          add("  orders: defineMockServer({ source: orders }),", 6),
          context("});", 6, 7),
        ],
      },
    ]);
  });
});

describe("an insertion at the end of a file without a final line break", () => {
  const oldText = "a\nb\nc\nd\ne";
  const edits = [insertion(oldText.length, "\nf")];
  const newText = "a\nb\nc\nd\ne\nf";

  it("shows the last old line as context and the new line as added", () => {
    expect(buildDiffHunks(oldText, newText, edits)).toEqual([
      {
        lines: [context("c", 3, 3), context("d", 4, 4), context("e", 5, 5), add("f", 6)],
      },
    ]);
  });
});

describe("an insertion after the final line break", () => {
  const edits = [insertion(4, "c\n")];

  it("adds a line after the last one without an empty line after it", () => {
    expect(buildDiffHunks("a\nb\n", "a\nb\nc\n", edits)).toEqual([
      { lines: [context("a", 1, 1), context("b", 2, 2), add("c", 3)] },
    ]);
  });
});

describe("two insertions far apart", () => {
  const oldText = numbered(20);
  const first = oldText.indexOf("line 3\n");
  const second = oldText.indexOf("line 15\n");
  const edits = [insertion(first, "X\n"), insertion(second, "Y\n")];
  const newText = `${oldText.slice(0, first)}X\n${oldText.slice(first, second)}Y\n${oldText.slice(second)}`;

  it("shows two hunks, each with its own context", () => {
    expect(buildDiffHunks(oldText, newText, edits)).toEqual([
      {
        lines: [
          context("line 1", 1, 1),
          context("line 2", 2, 2),
          add("X", 3),
          context("line 3", 3, 4),
          context("line 4", 4, 5),
          context("line 5", 5, 6),
        ],
      },
      {
        lines: [
          context("line 12", 12, 13),
          context("line 13", 13, 14),
          context("line 14", 14, 15),
          add("Y", 16),
          context("line 15", 15, 17),
          context("line 16", 16, 18),
          context("line 17", 17, 19),
        ],
      },
    ]);
  });
});

describe("two insertions close together", () => {
  it("merges them into one hunk when their context would touch", () => {
    const oldText = numbered(20);
    const first = oldText.indexOf("line 5\n");
    const second = oldText.indexOf("line 11\n");
    const edits = [insertion(first, "X\n"), insertion(second, "Y\n")];
    const newText = `${oldText.slice(0, first)}X\n${oldText.slice(first, second)}Y\n${oldText.slice(second)}`;

    expect(buildDiffHunks(oldText, newText, edits)).toEqual([
      {
        lines: [
          context("line 2", 2, 2),
          context("line 3", 3, 3),
          context("line 4", 4, 4),
          add("X", 5),
          context("line 5", 5, 6),
          context("line 6", 6, 7),
          context("line 7", 7, 8),
          context("line 8", 8, 9),
          context("line 9", 9, 10),
          context("line 10", 10, 11),
          add("Y", 12),
          context("line 11", 11, 13),
          context("line 12", 12, 14),
          context("line 13", 13, 15),
        ],
      },
    ]);
  });

  it("keeps them apart when one unchanged line would separate their context", () => {
    const oldText = numbered(20);
    const first = oldText.indexOf("line 5\n");
    const second = oldText.indexOf("line 12\n");
    const edits = [insertion(first, "X\n"), insertion(second, "Y\n")];
    const newText = `${oldText.slice(0, first)}X\n${oldText.slice(first, second)}Y\n${oldText.slice(second)}`;

    expect(buildDiffHunks(oldText, newText, edits)).toEqual([
      {
        lines: [
          context("line 2", 2, 2),
          context("line 3", 3, 3),
          context("line 4", 4, 4),
          add("X", 5),
          context("line 5", 5, 6),
          context("line 6", 6, 7),
          context("line 7", 7, 8),
        ],
      },
      {
        lines: [
          context("line 9", 9, 10),
          context("line 10", 10, 11),
          context("line 11", 11, 12),
          add("Y", 13),
          context("line 12", 12, 14),
          context("line 13", 13, 15),
          context("line 14", 14, 16),
        ],
      },
    ]);
  });
});

describe("text inserted inside an existing line", () => {
  const oldText = [
    "export default defineMocks({",
    "  users: defineMockServer({ source: users })",
    "});",
    "",
  ].join("\n");
  const at = oldText.indexOf("\n});");
  const added = ",\n  orders: defineMockServer({ source: orders })";
  const newText = oldText.slice(0, at) + added + oldText.slice(at);

  it("shows a comma added to a line as the old line removed and the new one added", () => {
    expect(buildDiffHunks(oldText, newText, [insertion(at, added)])).toEqual([
      {
        lines: [
          context("export default defineMocks({", 1, 1),
          remove("  users: defineMockServer({ source: users })", 2),
          add("  users: defineMockServer({ source: users }),", 2),
          add("  orders: defineMockServer({ source: orders })", 3),
          context("});", 3, 4),
        ],
      },
    ]);
  });

  it("shows a comma and a new line from separate insertions the same way", () => {
    const next = oldText.indexOf("});");
    const edits = [
      insertion(at, ","),
      insertion(next, "  orders: defineMockServer({ source: orders })\n"),
    ];

    expect(buildDiffHunks(oldText, newText, edits)).toEqual([
      {
        lines: [
          context("export default defineMocks({", 1, 1),
          remove("  users: defineMockServer({ source: users })", 2),
          add("  users: defineMockServer({ source: users }),", 2),
          add("  orders: defineMockServer({ source: orders })", 3),
          context("});", 3, 4),
        ],
      },
    ]);
  });

  it("shows a name added inside import braces as the import line replaced", () => {
    const importLine = 'import { defineMocks } from "@noverax/courier-mock";\n';
    const at = importLine.indexOf(" }");
    const edits = [insertion(at, ", defineMockServer")];
    const after = 'import { defineMocks, defineMockServer } from "@noverax/courier-mock";\n';

    expect(buildDiffHunks(importLine, after, edits)).toEqual([
      {
        lines: [
          remove('import { defineMocks } from "@noverax/courier-mock";', 1),
          add('import { defineMocks, defineMockServer } from "@noverax/courier-mock";', 1),
        ],
      },
    ]);
  });

  it("shows a line split in two as the old line removed and both halves added", () => {
    expect(buildDiffHunks("abc\n", "a\nbc\n", [insertion(1, "\n")])).toEqual([
      { lines: [remove("abc", 1), add("a", 1), add("bc", 2)] },
    ]);
  });
});

describe("a file with CRLF line breaks", () => {
  it("numbers lines by CRLF and shows no carriage return", () => {
    const edits = [insertion(3, "x\r\n")];

    expect(buildDiffHunks("a\r\nb\r\nc\r\n", "a\r\nx\r\nb\r\nc\r\n", edits)).toEqual([
      { lines: [context("a", 1, 1), add("x", 2), context("b", 2, 3), context("c", 3, 4)] },
    ]);
  });

  it("shows a comma added before a CRLF as the line replaced", () => {
    expect(buildDiffHunks("a\r\nb\r\n", "a,\r\nb\r\n", [insertion(1, ",")])).toEqual([
      { lines: [remove("a", 1), add("a,", 1), context("b", 2, 2)] },
    ]);
  });
});

describe("a file that starts with a byte order mark", () => {
  it("does not show the mark on an unchanged first line", () => {
    const oldText = "\uFEFFimport a;\nexport default {};\n";
    const at = oldText.indexOf("export");
    const newText = `\uFEFFimport a;\n// b\nexport default {};\n`;

    expect(buildDiffHunks(oldText, newText, [insertion(at, "// b\n")])).toEqual([
      {
        lines: [context("import a;", 1, 1), add("// b", 2), context("export default {};", 2, 3)],
      },
    ]);
  });

  it("does not show the mark on a changed first line", () => {
    const edits = [insertion(2, ",")];

    expect(buildDiffHunks("\uFEFFa\nb\n", "\uFEFFa,\nb\n", edits)).toEqual([
      { lines: [remove("a", 1), add("a,", 1), context("b", 2, 2)] },
    ]);
  });
});

describe("a new file", () => {
  it("shows every line as added in one hunk", () => {
    const newText = "import a;\n\nexport default {};\n";
    const edits = [insertion(0, newText)];

    expect(buildDiffHunks("", newText, edits)).toEqual([
      { lines: [add("import a;", 1), add("", 2), add("export default {};", 3)] },
    ]);
  });

  it("shows a last line without a line break", () => {
    expect(buildDiffHunks("", "a\nb", [insertion(0, "a\nb")])).toEqual([
      { lines: [add("a", 1), add("b", 2)] },
    ]);
  });
});

describe("a long line", () => {
  const long = "x".repeat(300);
  const cut = `${"x".repeat(199)}…`;

  it("is cut to 200 characters ending in an ellipsis when added", () => {
    const edits = [insertion(2, `${long}\n`)];

    expect(buildDiffHunks("a\n", `a\n${long}\n`, edits)).toEqual([
      { lines: [context("a", 1, 1), add(cut, 2)] },
    ]);
  });

  it("is cut the same way on both sides when changed", () => {
    expect(buildDiffHunks(`${long}\n`, `${long},\n`, [insertion(300, ",")])).toEqual([
      { lines: [remove(cut, 1), add(cut, 1)] },
    ]);
  });
});

describe("insertions that change nothing or cannot be shown", () => {
  it("shows no hunk for no edits or an empty insertion", () => {
    expect(buildDiffHunks("a\n", "a\n", [])).toEqual([]);
    expect(buildDiffHunks("a\n", "a\n", [insertion(1, "")])).toEqual([]);
  });

  it("shows two insertions at one offset in the order given", () => {
    const edits = [insertion(2, "x\n"), insertion(2, "y\n")];

    expect(buildDiffHunks("a\nb\n", "a\nx\ny\nb\n", edits)).toEqual([
      { lines: [context("a", 1, 1), add("x", 2), add("y", 3), context("b", 2, 4)] },
    ]);
  });

  it("refuses an edit that replaces text", () => {
    const act = () => buildDiffHunks("ab\n", "xb\n", [{ start: 0, end: 1, text: "x" }]);

    expect(act).toThrow(MocksEditRefusal);
    expect(act).toThrow(expect.objectContaining({ code: "INTERNAL_PLAN_REJECTED" }));
  });

  it("refuses insertions out of text order", () => {
    const act = () => buildDiffHunks("ab\n", "xaby\n", [insertion(2, "y"), insertion(0, "x")]);

    expect(act).toThrow(expect.objectContaining({ code: "INTERNAL_PLAN_REJECTED" }));
  });
});
