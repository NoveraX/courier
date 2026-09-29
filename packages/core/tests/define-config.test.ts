/**
 * What courier.config accepts, checked by the compiler. It declares no mock
 * servers: the file is also loaded in production, so mocks live in
 * courier.mocks.ts, which only Studio reads.
 */
import { describe, expect, it } from "vitest";

import { defineConfig } from "../src/config";
import { courier, defineApi } from "../src/define";

const { endpoint } = courier();
const api = defineApi({
  baseURL: "https://api.example",
  endpoints: { health: endpoint.get("health") },
});

describe("defineConfig", () => {
  it("takes the sources", () => {
    expect(Object.keys(defineConfig({ sources: { api } }).sources)).toEqual(["api"]);
  });

  it("has no mocks: they are declared in courier.mocks.ts", () => {
    const definition = { __type: "courier-mock-server", source: api } as const;

    // @ts-expect-error courier.config has no `mocks`
    defineConfig({ sources: { api }, mocks: { api: definition } });
  });
});
