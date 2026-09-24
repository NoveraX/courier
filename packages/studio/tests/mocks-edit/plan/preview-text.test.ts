import { describe, expect, it } from "vitest";

import { previewText } from "../../../src/server/mocks-edit/plan/preview-text";

describe("previewText", () => {
  it("folds whitespace runs, line breaks included, to single spaces", () => {
    expect(previewText("export default {\n  users: 1,\r\n\t};")).toBe(
      "export default { users: 1, };",
    );
  });

  it("keeps text of 60 characters whole", () => {
    expect(previewText("a".repeat(60))).toBe("a".repeat(60));
  });

  it("cuts longer text after 60 characters and marks the cut", () => {
    expect(previewText("a".repeat(61))).toBe(`${"a".repeat(60)}…`);
  });
});
