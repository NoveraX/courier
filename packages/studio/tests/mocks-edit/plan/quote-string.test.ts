import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { quoteString } from "../../../src/server/mocks-edit/plan/quote-string";

describe("quoteString", () => {
  it("writes a plain string in the file's quote", () => {
    expect(quoteString("billing-api", '"')).toBe(`"billing-api"`);
    expect(quoteString("billing-api", "'")).toBe(`'billing-api'`);
  });

  it("escapes the file's quote and leaves the other alone", () => {
    expect(quoteString(`it's "x"`, "'")).toBe(`'it\\'s "x"'`);
    expect(quoteString(`it's "x"`, '"')).toBe(`"it's \\"x\\""`);
  });

  it("escapes backslashes, CR and LF", () => {
    expect(quoteString("a\\b\r\nc", '"')).toBe(`"a\\\\b\\r\\nc"`);
  });

  it("escapes line separators and control characters", () => {
    expect(quoteString("a\u2028b\u2029c\u0000d\td\u007f\u0085", '"')).toBe(
      `"a\\u2028b\\u2029c\\u0000d\\u0009d\\u007f\\u0085"`,
    );
  });

  it("keeps non-ASCII text as written", () => {
    expect(quoteString("ключ 😀", '"')).toBe(`"ключ 😀"`);
  });

  it("escapes a surrogate without its partner, and keeps a pair as written", () => {
    expect(quoteString("a\ud800b\udfffc😀", '"')).toBe(`"a\\ud800b\\udfffc😀"`);
  });

  it("reads back as the value it was given once written to disk as UTF-8", () => {
    const value = "a\ud800 </script>\udc00";

    const onDisk = Buffer.from(`export default ${quoteString(value, '"')};`, "utf8").toString(
      "utf8",
    );

    const [statement] = parseSync("x.ts", onDisk).program.body;
    expect(statement?.type).toBe("ExportDefaultDeclaration");
    const declaration =
      statement?.type === "ExportDefaultDeclaration" ? statement.declaration : null;
    expect(declaration?.type === "Literal" ? declaration.value : null).toBe(value);
  });

  it("reads back as the value it was given", () => {
    const value = `a'b"c\\d\r\n\u2028\u0001é😀`;

    const [statement] = parseSync("x.ts", `export default ${quoteString(value, "'")};`).program
      .body;

    expect(statement?.type).toBe("ExportDefaultDeclaration");
    const declaration =
      statement?.type === "ExportDefaultDeclaration" ? statement.declaration : null;
    expect(declaration?.type === "Literal" ? declaration.value : null).toBe(value);
  });
});
