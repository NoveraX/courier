import { describe, expect, it } from "vitest";

import { blockLines } from "../../../src/server/mocks-edit/plan/block-lines";

describe("blockLines", () => {
  it("writes each entry indented, with a comma and a line break", () => {
    expect(blockLines(["a", "b"], "  ", "\n", true)).toBe("  a,\n  b,\n");
  });

  it("leaves the last comma out when asked", () => {
    expect(blockLines(["a", "b"], "\t", "\r\n", false)).toBe("\ta,\r\n\tb\r\n");
  });
});
