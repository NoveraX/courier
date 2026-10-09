import { describe, expect, it } from "vitest";

import { changedLines } from "../../src/edit/line-diff";

describe("changedLines", () => {
  it("returns nothing for a file that did not change", () => {
    expect(changedLines("a\nb\n", "a\nb\n")).toEqual([]);
  });

  it("numbers an added line as the file is left", () => {
    expect(changedLines("a\nc\n", "a\nb\nc\n")).toEqual([{ sign: "+", line: 2, text: "b" }]);
  });

  it("shows a replaced line removed, then added", () => {
    expect(
      changedLines("x\nplugins: [react()],\ny\n", "x\nplugins: [react(), courierStudio()],\ny\n"),
    ).toEqual([
      { sign: "-", line: 2, text: "plugins: [react()]," },
      { sign: "+", line: 2, text: "plugins: [react(), courierStudio()]," },
    ]);
  });

  it("keeps two separate changes apart, in the file's order", () => {
    const before = "import a;\n\nexport default [a];\n";
    const after = "import a;\nimport b;\n\nexport default [a, b];\n";

    expect(changedLines(before, after).map((line) => `${line.sign}${line.line}`)).toEqual([
      "+2",
      "-3",
      "+4",
    ]);
  });
});
