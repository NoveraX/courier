import { describe, expect, it } from "vitest";

import { detectTrailingCommas } from "../../../src/server/mocks-edit/plan/detect-trailing-commas";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";

function detect(text: string): boolean {
  return detectTrailingCommas(parseSource("x.ts", text));
}

describe("detectTrailingCommas", () => {
  it("is true when multi-line literals end with a comma", () => {
    expect(detect("const a = {\n  b: 1,\n};\nconst c = [\n  1,\n];\n")).toBe(true);
  });

  it("is false when most multi-line literals end without one", () => {
    expect(
      detect("const a = {\n  b: 1\n};\nconst c = [\n  1\n];\nconst d = {\n  e: 1,\n};\n"),
    ).toBe(false);
  });

  it("ignores single-line literals, which formatters write without the comma", () => {
    expect(detect("const a = { b: 1 };\nconst c = [1, 2];\nconst d = {\n  e: 1,\n};\n")).toBe(true);
  });

  it("looks past a comment after the last item", () => {
    expect(detect("const a = {\n  b: 1 // note\n};\n")).toBe(false);
  });

  it("counts nested literals", () => {
    expect(detect("export default {\n  a: {\n    b: 1\n  }\n};\n")).toBe(false);
  });

  it("defaults to true when there is no multi-line literal", () => {
    expect(detect("const a = { b: 1 };\n")).toBe(true);
  });
});
