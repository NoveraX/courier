import { describe, expect, it } from "vitest";

import { countLineTerminators } from "../../../src/server/mocks-edit/plan/count-line-terminators";

describe("countLineTerminators", () => {
  it("counts each kind once, CRLF included", () => {
    expect(countLineTerminators("a\r\n\nb\rc\u2028d\u2029", 0, 10)).toBe(5);
  });

  it("counts only within the range", () => {
    expect(countLineTerminators("a\n\nb\n", 1, 3)).toBe(2);
    expect(countLineTerminators("a\n\nb\n", 3, 4)).toBe(0);
  });
});
