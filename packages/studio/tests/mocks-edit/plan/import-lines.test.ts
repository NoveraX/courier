import { parseSource } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";
import { applyEdits } from "../../../src/server/mocks-edit/plan/apply-edits";
import { DEFAULT_STYLE } from "../../../src/server/mocks-edit/plan/detect-style";
import type { ImportLines } from "../../../src/server/mocks-edit/plan/import-lines";
import { planImportLines } from "../../../src/server/mocks-edit/plan/import-lines";
import type { FileStyle } from "../../../src/server/mocks-edit/plan/types";

const STATEMENTS = [`import a from "a";`, `import b from "b";`];
const NO_SEMICOLONS: FileStyle = { ...DEFAULT_STYLE, semicolons: false };
const UNENDED = [`import a from "a"`, `import b from "b"`];

function plan(
  text: string,
  style: FileStyle = DEFAULT_STYLE,
  statements: readonly string[] = STATEMENTS,
): ImportLines | null {
  return planImportLines(parseSource("x.ts", text), statements, style);
}

function edited(
  text: string,
  style: FileStyle = DEFAULT_STYLE,
  statements: readonly string[] = STATEMENTS,
): string {
  const lines = plan(text, style, statements);
  return lines === null ? text : applyEdits(text, [lines.edit]);
}

function parses(text: string): boolean {
  return parseSource("x.ts", text).problem === null;
}

describe("planImportLines after the last import", () => {
  it("plans nothing for no declarations", () => {
    expect(planImportLines(parseSource("x.ts", "const a = 1;"), [], DEFAULT_STYLE)).toBeNull();
  });

  it("writes the lines after the last import's line, past a comment that ends on it", () => {
    const text = `import x from "x";\nimport y from "y"; // why\nconst z = 1;\n`;

    expect(edited(text)).toBe(
      `import x from "x";\nimport y from "y"; // why\nimport a from "a";\nimport b from "b";\nconst z = 1;\n`,
    );
    expect(plan(text)?.statements).toEqual(STATEMENTS);
  });

  it("keeps a CRLF file's line endings, and leaves semicolons out when it does", () => {
    const style = { ...NO_SEMICOLONS, eol: "\r\n" as const };

    expect(edited(`import x from "x"\r\n\r\nx()\r\n`, style, UNENDED)).toBe(
      `import x from "x"\r\nimport a from "a"\r\nimport b from "b"\r\n\r\nx()\r\n`,
    );
  });

  it("writes the lines after a last import that ends the file without a line break", () => {
    expect(edited(`import x from "x";`)).toBe(
      `import x from "x";\nimport a from "a";\nimport b from "b";`,
    );
  });

  it.each([
    ["a lone CR", "\r"],
    ["U+2028", "\u2028"],
    ["U+2029", "\u2029"],
  ])("writes the lines after an import whose line ends with %s", (_name, terminator) => {
    const text = `import x from "x"${terminator}x()\n`;

    const result = edited(text, NO_SEMICOLONS, UNENDED);

    expect(result).toBe(
      `import x from "x"${terminator}import a from "a"\nimport b from "b"\nx()\n`,
    );
    expect(parses(result)).toBe(true);
  });

  it("starts new lines at the import's end when code follows it on its line, each ended", () => {
    const text = `import x from "x"; x();\n`;

    expect(edited(text, NO_SEMICOLONS, UNENDED)).toBe(
      `import x from "x";\nimport a from "a";\nimport b from "b"; x();\n`,
    );
    expect(plan(text, NO_SEMICOLONS, UNENDED)?.statements).toEqual(STATEMENTS);
  });

  it("starts new lines at the import's end when a comment that runs past its line follows it", () => {
    const text = `import x from "x" /* a\n b */ x()\n`;

    const result = edited(text, NO_SEMICOLONS, UNENDED);

    expect(result).toBe(
      `import x from "x"\nimport a from "a";\nimport b from "b"; /* a\n b */ x()\n`,
    );
    expect(parses(result)).toBe(true);
  });

  it("starts new lines at the import's end when a comment running past its line ends a line", () => {
    const text = `import x from "x"; /* a\n b */\nx();\n`;

    expect(edited(text)).toBe(
      `import x from "x";\nimport a from "a";\nimport b from "b"; /* a\n b */\nx();\n`,
    );
  });
});

describe("planImportLines in a file without imports", () => {
  it("writes before the first statement, after a directive, then a blank line", () => {
    expect(edited(`// header\n"use strict";\nexport default {};\n`)).toBe(
      `// header\n"use strict";\nimport a from "a";\nimport b from "b";\n\nexport default {};\n`,
    );
  });

  it("writes after a hashbang", () => {
    expect(edited(`#!/usr/bin/env node\nexport default {};\n`)).toBe(
      `#!/usr/bin/env node\nimport a from "a";\nimport b from "b";\n\nexport default {};\n`,
    );
  });

  it("writes above the comment that governs the first statement", () => {
    expect(edited(`// @ts-expect-error -- untyped\nconst helper = require("./helper");\n`)).toBe(
      `import a from "a";\nimport b from "b";\n\n// @ts-expect-error -- untyped\nconst helper = require("./helper");\n`,
    );
  });

  it("writes at the end of a file without statements, after a blank line", () => {
    expect(edited("// only a comment")).toBe(
      `// only a comment\n\nimport a from "a";\nimport b from "b";\n`,
    );
    expect(edited("")).toBe(`import a from "a";\nimport b from "b";\n`);
  });
});
