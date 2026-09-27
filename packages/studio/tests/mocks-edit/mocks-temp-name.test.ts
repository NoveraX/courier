import { describe, expect, it } from "vitest";
import { MOCKS_TEMP_NAME, MOCKS_TEMP_PREFIX } from "../../src/server/mocks-edit/mocks-temp-name";

describe("MOCKS_TEMP_NAME", () => {
  it("matches the temporary files Studio writes and nothing Studio loads", () => {
    expect(MOCKS_TEMP_NAME.test(".courier.mocks.4242-0a1b2c3d.tmp")).toBe(true);
    expect(MOCKS_TEMP_NAME.test("courier.mocks.ts")).toBe(false);
    expect(MOCKS_TEMP_NAME.test(".courier.mocks.tmp")).toBe(false);
    expect(MOCKS_TEMP_NAME.test(".courier.mocks.4242-0a1b2c3d.tmp.ts")).toBe(false);
  });

  it("matches the names the mocks prefix produces", () => {
    expect(MOCKS_TEMP_NAME.test(`${MOCKS_TEMP_PREFIX}.4242-0a1b2c3d.tmp`)).toBe(true);
  });
});
