import { describe, expect, it } from "vitest";

import { applyEdits } from "../../../src/server/mocks-edit/plan/apply-edits";

describe("applyEdits", () => {
  it("applies ascending edits", () => {
    expect(
      applyEdits("abc", [
        { start: 1, end: 1, text: "X" },
        { start: 2, end: 3, text: "Y" },
      ]),
    ).toBe("aXbY");
  });

  it("returns the text unchanged for no edits", () => {
    expect(applyEdits("abc", [])).toBe("abc");
  });
});
