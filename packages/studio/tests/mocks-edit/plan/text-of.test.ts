import { describe, expect, it } from "vitest";

import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";
import { textOf } from "../../../src/server/mocks-edit/plan/text-of";

describe("textOf", () => {
  it("returns the text a node spans, as written", () => {
    const parsed = parseSource("x.ts", "// é😀\nexport default {\n  a: 1 };\n");
    const [statement] = parsed.program.body;

    expect(statement === undefined ? null : textOf(parsed, statement)).toBe(
      "export default {\n  a: 1 };",
    );
  });
});
