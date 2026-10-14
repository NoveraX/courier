import { parseSource } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";
import { applyEdits } from "../../../src/server/mocks-edit/plan/apply-edits";
import { DEFAULT_STYLE } from "../../../src/server/mocks-edit/plan/detect-style";
import type { RenderEntries } from "../../../src/server/mocks-edit/plan/list-insertion";
import { planListInsertion } from "../../../src/server/mocks-edit/plan/list-insertion";
import type { FileStyle } from "../../../src/server/mocks-edit/plan/types";

/* Renders each entry as its name, and records the layouts asked for. */
function renderer(names: string[], asked: Array<[string, boolean]>): RenderEntries {
  return (indent, block) => {
    asked.push([indent, block]);
    return names;
  };
}

function inserted(
  text: string,
  { style = DEFAULT_STYLE, singleLineFile = false, names = ["x", "y"] } = {} as {
    style?: FileStyle;
    singleLineFile?: boolean;
    names?: string[];
  },
): { text: string; asked: Array<[string, boolean]> } {
  const parsed = parseSource("x.ts", text);
  const [statement] = parsed.program.body;
  if (
    statement?.type !== "ExportDefaultDeclaration" ||
    statement.declaration.type !== "ObjectExpression"
  ) {
    throw new Error("the fixture must export an object");
  }
  const object = statement.declaration;
  const list = { open: object.start, close: object.end - 1, items: object.properties };
  const site = {
    text,
    comments: parsed.comments,
    commentEnds: parsed.commentEnds,
    style,
    singleLineFile,
  };
  const asked: Array<[string, boolean]> = [];
  const edits = planListInsertion(list, site, renderer(names, asked));
  return { text: applyEdits(text, edits), asked };
}

describe("planListInsertion into a block", () => {
  it("writes each entry on its own line at the last item's indentation", () => {
    expect(inserted("export default {\n    a: 1,\n};")).toEqual({
      text: "export default {\n    a: 1,\n    x,\n    y,\n};",
      asked: [["    ", true]],
    });
  });

  it("adds the missing comma, and leaves the last out when the style has none", () => {
    const style = { ...DEFAULT_STYLE, trailingCommas: false };

    expect(inserted("export default {\n  a: 1\n};", { style }).text).toBe(
      "export default {\n  a: 1,\n  x,\n  y\n};",
    );
  });

  it("keeps the last comma when the object had one, whatever the style", () => {
    const style = { ...DEFAULT_STYLE, trailingCommas: false };

    expect(inserted("export default {\n  a: 1,\n};", { style }).text).toBe(
      "export default {\n  a: 1,\n  x,\n  y,\n};",
    );
  });

  it("indents one unit past the brace's line when the last item shares a line", () => {
    expect(
      inserted("export default { a: 1,\n};", { style: { ...DEFAULT_STYLE, indent: "\t" } }),
    ).toEqual({
      text: "export default { a: 1,\n\tx,\n\ty,\n};",
      asked: [["\t", true]],
    });
  });

  it("takes the last item's indentation from a line with tabs and spaces", () => {
    expect(inserted("export default {\n\t  a: 1,\n};").asked).toEqual([["\t  ", true]]);
  });

  it.each([
    ["a lone CR", "\r"],
    ["U+2028", "\u2028"],
    ["U+2029", "\u2029"],
  ])("reads a brace that %s puts on a line of its own as a block", (_what, terminator) => {
    const text = `export default {${terminator}    a: 1,${terminator}};`;

    expect(inserted(text, { style: { ...DEFAULT_STYLE, eol: "\r" } })).toEqual({
      text: `export default {${terminator}    a: 1,${terminator}    x,\r    y,\r};`,
      asked: [["    ", true]],
    });
  });

  it("takes the last item's indentation from the line a lone CR starts", () => {
    expect(inserted("export default {\r    a: 1,\n};").text).toBe(
      "export default {\r    a: 1,\n    x,\n    y,\n};",
    );
  });

  it("writes an empty object's entries below a line comment that a lone CR ends", () => {
    expect(inserted("export default { // none\r};").text).toBe(
      "export default { // none\r  x,\n  y,\n};",
    );
  });

  it("writes an empty block's entries one unit past the brace's indentation", () => {
    expect(inserted("export default {\n    };").text).toBe(
      "export default {\n      x,\n      y,\n    };",
    );
  });
});

describe("planListInsertion inline", () => {
  it("writes the entries after the last item", () => {
    expect(inserted("export default { a: 1 };")).toEqual({
      text: "export default { a: 1, x, y };",
      asked: [["", false]],
    });
  });

  it("writes them after a trailing comma", () => {
    expect(inserted("export default { a: 1, };").text).toBe("export default { a: 1, x, y, };");
  });

  it("writes after a comment in an otherwise empty object", () => {
    expect(inserted("export default { /* none */ };").text).toBe(
      "export default { /* none */ x, y };",
    );
  });

  it("keeps an empty {} inline in a one-line file", () => {
    expect(inserted("export default {};", { singleLineFile: true }).text).toBe(
      "export default { x, y };",
    );
    expect(inserted("export default { };", { singleLineFile: true }).text).toBe(
      "export default { x, y };",
    );
  });

  it("opens an empty {} into a block past its line's indentation, stepping over a BOM", () => {
    expect(inserted("\uFEFF  export default {};", { names: ["x"] }).text).toBe(
      "\uFEFF  export default {\n    x,\n  };",
    );
  });

  it("opens an empty {} into a block at the parent's indentation otherwise", () => {
    expect(inserted("export default {};", { names: ["x"] })).toEqual({
      text: "export default {\n  x,\n};",
      asked: [["  ", true]],
    });
  });
});
