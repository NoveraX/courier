import { describe, expect, it } from "vitest";

import { readMockDeclaration } from "../../src/server/mocks-edit/read-mock-declaration";

describe("reading one mock declaration", () => {
  it("returns a new declaration with the entry's values", () => {
    const entry = { key: "users", source: "users", port: 4000, seedCount: 5, autoStart: false };

    const result = readMockDeclaration(entry, 0);

    expect(result).toEqual({ ok: true, value: entry });
    expect(result.ok && result.value).not.toBe(entry);
  });

  it("names the entry by its index", () => {
    const entry = { key: "users", source: "users", port: null, seedCount: 5, autoStart: "yes" };

    expect(readMockDeclaration(entry, 7)).toEqual({
      ok: false,
      message: "mocks[7].autoStart must be a boolean",
    });
  });

  it("checks the fields in declaration order", () => {
    const entry = { key: 1, source: 2, port: "0", seedCount: "0", autoStart: null };

    expect(readMockDeclaration(entry, 0)).toEqual({
      ok: false,
      message: "mocks[0].key must be a string",
    });
  });

  it("reads values of the right type whatever they are, leaving their rules to later", () => {
    const entry = { key: "1 bad key", source: "", port: -1, seedCount: 1.5, autoStart: false };

    expect(readMockDeclaration(entry, 0)).toEqual({ ok: true, value: entry });
  });
});
