import { describe, expect, it } from "vitest";

import { mocksFileNameFor } from "../../src/server/mocks-edit/mocks-file-name";

describe("mocksFileNameFor", () => {
  it("follows an ES module TypeScript config, and is courier.mocks.ts otherwise", () => {
    expect(mocksFileNameFor("courier.config.mts")).toBe("courier.mocks.mts");
    expect(["courier.config.ts", "courier.config.js", "courier.config.mjs", "courier.config.cts"].map(mocksFileNameFor)).toEqual([
      "courier.mocks.ts",
      "courier.mocks.ts",
      "courier.mocks.ts",
      "courier.mocks.ts",
    ]);
  });
});
