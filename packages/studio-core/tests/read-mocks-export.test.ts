/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readMocksExport } from "../src/runtime/read-mocks-export";

describe("readMocksExport", () => {
  const file = "/p/courier.mocks.ts";

  it("reads the mocks from the default export", () => {
    const mocks = { api: { source: {} } };

    expect(readMocksExport({ default: mocks }, file)).toBe(mocks);
  });

  it("reads no mocks from a file with no statements", () => {
    expect(readMocksExport({}, file)).toEqual({});
  });

  it("reads no mocks from a default export that is undefined", () => {
    expect(readMocksExport({ default: undefined }, file)).toStrictEqual({});
  });

  it("reads the default as the module set it, not as an interop view hands it", () => {
    const exports = { default: undefined };
    const interop = new Proxy(exports, {
      get: (target, key) => (key === "default" ? target : Reflect.get(target, key)),
    });

    expect(readMocksExport(interop, file)).toStrictEqual({});
  });

  it("reads a default export defined by a getter", () => {
    const mocks = { api: { source: {} } };
    const exports = Object.defineProperty({}, "default", { enumerable: true, get: () => mocks });

    expect(readMocksExport(exports, file)).toBe(mocks);
  });

  it("names the default export a transpiled ES module with only named exports is missing", () => {
    const exports = Object.defineProperty({ apiMock: {} }, "__esModule", { value: true });

    expect(() => readMocksExport(exports, file)).toThrow(
      "/p/courier.mocks.ts has no default export; export default defineMocks({ ... })",
    );
  });

  it("names the default export an ES module namespace with only named exports is missing", async () => {
    const source = "data:text/javascript,export const apiMock = {};";
    const namespace: unknown = await import(source);

    expect(() => readMocksExport(namespace, file)).toThrow("has no default export");
  });

  it("reads a CommonJS module's exports with no default whole, as Node's import makes them its default", () => {
    const mocks = { apiMock: {} };

    expect(readMocksExport(mocks, file)).toBe(mocks);
  });

  it.each([
    ["an array", []],
    ["a string", "api"],
    ["null", null],
  ])("rejects a default export that is %s", (_, value) => {
    expect(() => readMocksExport({ default: value }, file)).toThrow(
      "must export an object of mocks by key",
    );
  });
});
