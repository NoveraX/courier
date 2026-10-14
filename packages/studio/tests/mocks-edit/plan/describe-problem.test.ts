import { parseSource } from "@noverax/courier-cli/devkit";
import { describe, expect, it } from "vitest";
import { describeProblem } from "../../../src/server/mocks-edit/plan/describe-problem";

describe("describeProblem", () => {
  it("reports the first error with the line it points at", () => {
    const parsed = parseSource(
      "courier.mocks.ts",
      "const a = 1;\nexport default {\n  a: 1\n  b: 2\n};\n",
    );

    expect(parsed.problem).not.toBeNull();
    expect(parsed.problem === null ? null : describeProblem(parsed, parsed.problem)).toBe(
      "Expected `,` or `}` but found `Identifier` (line 4)",
    );
  });
});
