import { describe, expect, it } from "vitest";

import { insertion } from "../../../src/server/mocks-edit/plan/insertion";

describe("insertion", () => {
  it("replaces nothing", () => {
    expect(insertion(3, "x")).toEqual({ start: 3, end: 3, text: "x" });
  });
});
