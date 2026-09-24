import { describe, expect, it } from "vitest";

import { DEFAULT_STYLE, detectStyle } from "../../../src/server/mocks-edit/plan/detect-style";
import { locateMocksObject } from "../../../src/server/mocks-edit/plan/locate-mocks-object";
import { readMockImports } from "../../../src/server/mocks-edit/plan/mock-imports";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";
import type { FileStyle } from "../../../src/server/mocks-edit/plan/types";

function styleOf(text: string, fileName = "x.ts"): FileStyle {
  return detectStyle(parseSource(fileName, text));
}

describe("detectStyle", () => {
  it("reads Biome's defaults from an empty file", () => {
    expect(styleOf("")).toEqual({
      eol: "\n",
      quote: '"',
      semicolons: true,
      indent: "  ",
      trailingCommas: true,
    });
    expect(DEFAULT_STYLE).toEqual({
      eol: "\n",
      quote: '"',
      semicolons: true,
      indent: "  ",
      trailingCommas: true,
    });
  });

  it("reads a whole style", () => {
    const text =
      "import a from 'a'\r\nimport b from 'b'\r\n\r\nexport default {\r\n\tc: [\r\n\t\t1\r\n\t]\r\n}\r\n";

    expect(styleOf(text)).toEqual({
      eol: "\r\n",
      quote: "'",
      semicolons: false,
      indent: "\t",
      trailingCommas: false,
    });
  });

  it("takes CRLF only when it outnumbers lone LF", () => {
    expect(styleOf("a;\r\nb;\nc;\n").eol).toBe("\n");
    expect(styleOf("a;\r\nb;\r\nc;\n").eol).toBe("\r\n");
  });

  it("takes a lone CR when it ends most lines, a tie going to LF, then CRLF", () => {
    expect(styleOf("a;\rb;\rc;\n").eol).toBe("\r");
    expect(styleOf("a;\rb;\n").eol).toBe("\n");
    expect(styleOf("a;\rb;\r\n").eol).toBe("\r\n");
  });

  it("does not take U+2028 or U+2029 as a file's line ending", () => {
    expect(styleOf("a;\u2028b;\u2029c;\u2028").eol).toBe("\n");
    expect(styleOf("a;\u2028b;\u2028c;\r\n").eol).toBe("\r\n");
  });

  it("takes the majority quote of module specifiers, counting exports", () => {
    const text = `import a from 'a';\nexport { b } from 'b';\nexport * from "c";\nconst d = "ignored";\n`;

    expect(styleOf(text).quote).toBe("'");
  });

  it("keeps double quotes on a tie", () => {
    expect(styleOf(`import a from 'a';\nimport b from "b";\n`).quote).toBe('"');
  });

  it("reads semicolons from imports when the file has them", () => {
    expect(
      styleOf(`import a from "a"\nimport b from "b"\nconst c = 1;\nconst d = 2;\nconst e = 3;\n`)
        .semicolons,
    ).toBe(false);
  });

  it("reads semicolons from statements that take one when the file has no imports", () => {
    expect(styleOf("function f() {}\nclass C {}\nconst a = 1\nexport default a\n").semicolons).toBe(
      false,
    );
    expect(styleOf("function f() {}\nconst a = 1;\nexport default a;\n").semicolons).toBe(true);
  });
});

describe("detectStyle with the mocks object", () => {
  function trailingCommasOf(text: string): boolean {
    const parsed = parseSource("courier.mocks.ts", text);
    const located = locateMocksObject(parsed, readMockImports(parsed.program));
    return detectStyle(parsed, located.kind === "object" ? located.object : null).trailingCommas;
  }

  const OTHER_WITH_COMMAS = "const a = [\n  1,\n];\nconst b = {\n  c: 1,\n};\n";

  it("takes the trailing-comma style of a multi-line mocks object over the file's", () => {
    expect(trailingCommasOf(`${OTHER_WITH_COMMAS}export default {\n  users: 1\n};\n`)).toBe(false);
  });

  it("takes the file's style when the mocks object is on one line", () => {
    expect(trailingCommasOf(`${OTHER_WITH_COMMAS}export default { users: 1 };\n`)).toBe(true);
  });

  it("takes the file's style when the mocks object is empty", () => {
    expect(trailingCommasOf("const a = [\n  1\n];\nexport default {\n};\n")).toBe(false);
  });

  it("takes the file's style when there is no mocks object", () => {
    expect(trailingCommasOf("const a = {\n  b: 1\n};\n")).toBe(false);
  });
});
