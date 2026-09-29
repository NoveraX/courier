import { describe, expect, it } from "vitest";

import { configImportForm } from "../../../src/server/mocks-edit/plan/config-import-form";

describe("configImportForm", () => {
  it.each([
    ["export default { sources: {} };", "default"],
    ["const config = {}; export { config as default };", "default"],
    ["module.exports = { sources: {} };", "default"],
    ["export const sources = {};", "namespace"],
    ['export * from "./base"; export const studio = {};', "namespace"],
    ["export default {", "default"],
  ] as const)("reads %j as imported by its %s", (text, form) => {
    expect(configImportForm("courier.config.ts", text)).toBe(form);
  });

  it("keeps the default for a config it did not read", () => {
    expect(configImportForm("courier.config.ts", null)).toBe("default");
  });
});
