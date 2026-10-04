/**
 * How oxc's spans relate to the text: UTF-16 offsets into the JavaScript
 * string, a leading BOM counted as offset 0 — measured, since every edit
 * the planner makes depends on it.
 */
import { describe, expect, it } from "vitest";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";

describe("parseSource", () => {
  it("reports spans as UTF-16 offsets past astral and non-ASCII characters", () => {
    const text = "// é😀 «ключ»\nexport default { a: 1 };\n";

    const parsed = parseSource("courier.mocks.ts", text);

    const [statement] = parsed.program.body;
    expect(statement?.start).toBe(text.indexOf("export"));
    expect(statement?.end).toBe(text.indexOf(";") + 1);
    expect(parsed.comments.map((c) => [c.start, c.end])).toEqual([[0, text.indexOf("\n")]]);
  });

  it("counts a leading BOM as offset 0 and starts the program after it", () => {
    const text = "\uFEFF// c\nexport default {};\n";

    const parsed = parseSource("courier.mocks.ts", text);

    expect(parsed.comments.map((c) => [c.start, c.end])).toEqual([[1, 5]]);
    expect(parsed.program.body[0]?.start).toBe(6);
    expect(text.slice(6, 6 + "export".length)).toBe("export");
    expect(parsed.problem).toBeNull();
  });

  it("indexes each comment's end by its start", () => {
    const parsed = parseSource("courier.mocks.ts", "/* a */ const x = 1; // b\n");

    expect([...parsed.commentEnds]).toEqual([
      [0, 7],
      [21, 25],
    ]);
  });

  it("reads TypeScript in .mts and .cts files", () => {
    expect(parseSource("courier.mocks.mts", "const a = 1 as number;").problem).toBeNull();
    expect(parseSource("courier.mocks.cts", "const a = 1 satisfies number;").problem).toBeNull();
  });

  it("reads JavaScript in .mjs files, where a type annotation is an error", () => {
    expect(parseSource("courier.mocks.mjs", "const a = (x: number) => x;").problem?.message).toBe(
      "Expected `,` or `)` but found `:`",
    );
  });
});
