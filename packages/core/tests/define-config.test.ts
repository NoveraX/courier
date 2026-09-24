/**
 * What `mocks` accepts in `courier.config.ts`, checked by the compiler: a mock
 * definition for any source, or nothing under a key — never a source, a
 * string, or options that were not passed through `defineMockServer`.
 */
import { describe, expect, it } from "vitest";

import { defineConfig } from "../src/config";
import { courier, defineApi } from "../src/define";

const { endpoint } = courier();
const api = defineApi({ baseURL: "https://api.example", endpoints: { health: endpoint.get("health") } });
/* What `defineMockServer` returns, as far as core knows it. */
const definition = { __type: "courier-mock-server", source: api } as const;

describe("defineConfig mocks", () => {
  it("accepts a mock definition, and a key left undefined", () => {
    const config = defineConfig({ sources: { api }, mocks: { api: definition, off: undefined } });

    expect(Object.keys(config.mocks ?? {})).toEqual(["api", "off"]);
  });

  it("rejects a source in place of a mock definition", () => {
    // @ts-expect-error a source is not a mock definition
    defineConfig({ sources: { api }, mocks: { api } });
  });

  it("rejects options that were not passed through defineMockServer", () => {
    // @ts-expect-error `{ source, port }` has no `__type`
    defineConfig({ sources: { api }, mocks: { api: { source: api, port: 7001 } } });
  });

  it("rejects a path to a mock file", () => {
    // @ts-expect-error a string is not a mock definition
    defineConfig({ sources: { api }, mocks: { api: "./mock-servers/api.server.ts" } });
  });
});
