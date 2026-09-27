import { describe, expect, it } from "vitest";

import { importsCarryExtensions } from "../../../src/server/mocks-edit/plan/imports-carry-extensions";
import { parseSource } from "../../../src/server/mocks-edit/plan/parse-source";

function carries(text: string): boolean {
  return importsCarryExtensions(parseSource("courier.mocks.ts", text).program);
}

describe("importsCarryExtensions", () => {
  it.each([
    [`import { api } from "./src/api.js";`],
    [`import api from "../api.mjs";`],
    [`import type { Api } from "./types.js";`],
    [`import "./setup.js";`],
    [`export * from "./fixtures.js";`],
    [`export * as fixtures from "./fixtures.mjs";`],
    [`export { users } from "./users.js";`],
  ])("finds the extension in %s", (text) => {
    expect(carries(text)).toBe(true);
  });

  it.each([
    [`import { api } from "./src/api";`],
    [`import { api } from "./src/api.ts";`],
    [`import data from "./data.json";`],
    [`import helpers from "./helpers.cjs";`],
    [`import { faker } from "faker/locale/en.js";`],
    [`import { api } from "@/api.js";`],
    [`export const users = [];`],
  ])("finds none in %s", (text) => {
    expect(carries(text)).toBe(false);
  });

  it("finds one extension among relative imports that carry none", () => {
    expect(carries(`import { a } from "./a";\nimport { b } from "./b.js";\n`)).toBe(true);
  });

  it("finds none in a file with no statements", () => {
    expect(carries("")).toBe(false);
  });
});
