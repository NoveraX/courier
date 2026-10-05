/**
 * Self-test for `scripts/check-file-lines.mjs`: what counts as a line of
 * code, which files are held to nothing, and which are over the limit.
 */

import { describe, expect, it } from "vitest";
import { measure, overLimit } from "./check-file-lines.mjs";

function linesOf(count, line = "export const value = 1;") {
  return Array.from({ length: count }, (_, i) => line.replace("value", `value${i}`)).join("\n");
}

describe("a line of code", () => {
  it("is a non-blank line with something outside a comment on it", () => {
    const text = [
      "/**",
      " * The answer.",
      " */",
      "export const answer = 42; // asked once",
      "",
      "// a note",
      "/* a block */ export const other = 1;",
    ].join("\n");

    expect(measure("a.ts", text).lines).toBe(2);
  });

  it("is not cut short by a comment opener inside a string", () => {
    const text = [
      'const glob = "packages/*/src";',
      "const next = 1;",
      "export { glob, next };",
    ].join("\n");

    expect(measure("a.ts", text).lines).toBe(3);
  });
});

describe("a file", () => {
  it("of types alone is held to nothing, however long", () => {
    const types = linesOf(200, "export type Value = string;");

    expect(measure("types.ts", types).typesOnly).toBe(true);
    expect(overLimit([{ path: "types.ts", text: types }])).toEqual([]);
  });

  it("with one statement that runs is held to the limit", () => {
    const mixed = `${linesOf(150, "export type Value = string;")}\nexport const value = 1;`;

    expect(measure("mixed.ts", mixed).typesOnly).toBe(false);
    expect(overLimit([{ path: "mixed.ts", text: mixed }])).toEqual([
      { path: "mixed.ts", lines: 151 },
    ]);
  });

  it("is over the limit past 150 lines of code, and not at it", () => {
    expect(overLimit([{ path: "a.ts", text: linesOf(150) }])).toEqual([]);
    expect(overLimit([{ path: "a.ts", text: linesOf(151) }])).toEqual([
      { path: "a.ts", lines: 151 },
    ]);
  });

  it("reads JSX in a .tsx file", () => {
    expect(measure("view.tsx", "export const View = () => <div>hi</div>;").lines).toBe(1);
  });
});
