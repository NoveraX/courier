import { describe, expect, it } from "vitest";

import { DEFAULT_STYLE } from "../../../src/server/mocks-edit/plan/detect-style";
import { entryFields, renderEntry } from "../../../src/server/mocks-edit/plan/render-entry";
import type { EntryContext } from "../../../src/server/mocks-edit/plan/types";
import type { MockDeclaration } from "../../../src/server/mocks-edit/types";

function request(key: string, overrides: Partial<MockDeclaration> = {}): MockDeclaration {
  return { key, source: key, port: null, seedCount: 20, autoStart: false, ...overrides };
}

const CTX: EntryContext = {
  serverCallee: "defineMockServer",
  configLocal: "courierConfig",
  style: DEFAULT_STYLE,
  guardMocksColon: false,
};

describe("entryFields", () => {
  it("writes only the source for a mock with every default", () => {
    expect(entryFields(request("api"), CTX)).toEqual([
      { name: "source", value: "courierConfig.sources.api" },
    ]);
  });

  it("writes a port, a seed that is not 20, and autoStart, in that order", () => {
    expect(entryFields(request("api", { port: 4010, seedCount: 5, autoStart: true }), CTX)).toEqual(
      [
        { name: "source", value: "courierConfig.sources.api" },
        { name: "port", value: "4010" },
        { name: "seed", value: "{ count: 5 }" },
        { name: "autoStart", value: "true" },
      ],
    );
  });

  it("indexes a source whose key is not an identifier, in the file's quote", () => {
    const ctx = { ...CTX, style: { ...DEFAULT_STYLE, quote: "'" as const } };

    expect(entryFields(request("api", { source: "billing-api" }), ctx)).toEqual([
      { name: "source", value: "courierConfig.sources['billing-api']" },
    ]);
  });
});

describe("renderEntry", () => {
  it("writes an entry on one line when it fits in 80 columns with its comma", () => {
    const text = renderEntry(request("api", { autoStart: true }), CTX, "  ", true);

    expect(text).toBe(
      "api: defineMockServer({ source: courierConfig.sources.api, autoStart: true })",
    );
    expect(2 + text.length + 1).toBe(80);
  });

  it("puts one field per line when the line would pass 80 columns", () => {
    expect(renderEntry(request("apis", { autoStart: true }), CTX, "  ", true)).toBe(
      [
        "apis: defineMockServer({",
        "    source: courierConfig.sources.apis,",
        "    autoStart: true,",
        "  })",
      ].join("\n"),
    );
  });

  it("counts a tab as two columns", () => {
    expect(renderEntry(request("api", { autoStart: true }), CTX, "\t", true)).toBe(
      "api: defineMockServer({ source: courierConfig.sources.api, autoStart: true })",
    );
    expect(renderEntry(request("api", { autoStart: true }), CTX, "\t\t", true)).toBe(
      [
        "api: defineMockServer({",
        "\t\t  source: courierConfig.sources.api,",
        "\t\t  autoStart: true,",
        "\t\t})",
      ].join("\n"),
    );
  });

  it("leaves the last field's comma out when the file has no trailing commas, in its line ending", () => {
    const ctx = {
      ...CTX,
      style: { ...DEFAULT_STYLE, eol: "\r\n" as const, indent: "    ", trailingCommas: false },
    };

    expect(renderEntry(request("billing", { port: 4010, seedCount: 50 }), ctx, "    ", true)).toBe(
      [
        "billing: defineMockServer({",
        "        source: courierConfig.sources.billing,",
        "        port: 4010,",
        "        seed: { count: 50 }",
        "    })",
      ].join("\r\n"),
    );
  });

  it("keeps a long entry on one line when the layout does not allow breaks", () => {
    expect(renderEntry(request("billing", { port: 4010, seedCount: 50 }), CTX, "", false)).toBe(
      "billing: defineMockServer({ source: courierConfig.sources.billing, port: 4010, seed: { count: 50 } })",
    );
  });

  it("quotes a key that is not an identifier, escaping it", () => {
    expect(renderEntry(request(`a"b`, { source: "api" }), CTX, "", false)).toBe(
      `"a\\"b": defineMockServer({ source: courierConfig.sources.api })`,
    );
  });

  it("writes an ASCII identifier key bare, a reserved word too, and quotes any other", () => {
    const keys = ["api", "_a", "$b", "a1", "default", "1a", "a-b", "ключ", "a b"];

    expect(keys.map((key) => renderEntry(request(key, { source: "s" }), CTX, "", false))).toEqual([
      "api: defineMockServer({ source: courierConfig.sources.s })",
      "_a: defineMockServer({ source: courierConfig.sources.s })",
      "$b: defineMockServer({ source: courierConfig.sources.s })",
      "a1: defineMockServer({ source: courierConfig.sources.s })",
      "default: defineMockServer({ source: courierConfig.sources.s })",
      `"1a": defineMockServer({ source: courierConfig.sources.s })`,
      `"a-b": defineMockServer({ source: courierConfig.sources.s })`,
      `"ключ": defineMockServer({ source: courierConfig.sources.s })`,
      `"a b": defineMockServer({ source: courierConfig.sources.s })`,
    ]);
  });

  it("counts an astral character as one column", () => {
    const entry = renderEntry(request("a😀", { source: "s", autoStart: true }), CTX, "   ", true);

    expect(entry).toBe(
      `"a😀": defineMockServer({ source: courierConfig.sources.s, autoStart: true })`,
    );
  });

  it("writes the callee and config name it is given", () => {
    const ctx = { ...CTX, serverCallee: "mock.defineMockServer", configLocal: "config" };

    expect(renderEntry(request("api"), ctx, "", false)).toBe(
      "api: mock.defineMockServer({ source: config.sources.api })",
    );
  });

  it("keeps a snippet from reading mocks: through a key or a quoted source", () => {
    const ctx = { ...CTX, guardMocksColon: true };

    expect(renderEntry(request("mocks", { source: "old mocks: v1" }), ctx, "", false)).toBe(
      `"mocks": defineMockServer({ source: courierConfig.sources["old mocks\\x3a v1"] })`,
    );
  });

  it("writes a key ending in mocks bare outside a snippet", () => {
    expect(renderEntry(request("mocks"), CTX, "", false)).toBe(
      "mocks: defineMockServer({ source: courierConfig.sources.mocks })",
    );
  });
});
