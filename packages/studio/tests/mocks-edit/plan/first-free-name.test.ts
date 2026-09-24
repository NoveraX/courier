import { describe, expect, it } from "vitest";

import { firstFreeName } from "../../../src/server/mocks-edit/plan/first-free-name";

describe("firstFreeName", () => {
  it("returns the name itself when it is free", () => {
    expect(firstFreeName("courierConfig", new Map([["other", 0]]))).toBe("courierConfig");
  });

  it("numbers from 2 past every taken name", () => {
    const taken = new Map([
      ["courierConfig", 0],
      ["courierConfig2", 1],
      ["courierConfig4", 2],
    ]);

    expect(firstFreeName("courierConfig", taken)).toBe("courierConfig3");
  });
});
