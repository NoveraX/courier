import { describe, expect, it } from "vitest";

import { DEFAULT_STYLE } from "../../../src/server/mocks-edit/plan/detect-style";
import { mocksExport } from "../../../src/server/mocks-edit/plan/mocks-export";

describe("mocksExport", () => {
  it("writes the entries one per line at one unit of indentation", () => {
    expect(mocksExport("defineMocks", ["x: 1", "y: 2"], DEFAULT_STYLE)).toBe(
      "export default defineMocks({\n  x: 1,\n  y: 2,\n});",
    );
  });

  it("follows the style: line endings, indentation, commas and semicolons", () => {
    const style = {
      eol: "\r\n" as const,
      quote: "'" as const,
      semicolons: false,
      indent: "\t",
      trailingCommas: false,
    };

    expect(mocksExport("m.defineMocks", ["x: 1", "y: 2"], style)).toBe(
      "export default m.defineMocks({\r\n\tx: 1,\r\n\ty: 2\r\n})",
    );
  });
});
