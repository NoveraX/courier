/**
 * Tests for `CatalogStore.getRuntimeLayer` — the public read accessor
 * that `playground-stream-routing.ts:socketHostsEndpoint` calls to ask
 * "does this app session host the requested endpoint?"
 *
 * `getRuntimeLayer` lets the smart-routing code read individual session
 * layers without exposing the private `runtimeLayers` Map. The contract
 * is intentionally minimal:
 *
 *  - Returns the most recent `SourceMap` set via `setRuntimeLayer(id, …)`
 *  - Returns `undefined` for unknown ids and after `removeRuntimeLayer`
 *  - Reflects mutations immediately (no debounce gating reads — only the
 *    catalog snapshot emit is debounced)
 *
 * Without these tests the next refactor of `runtimeLayers` storage could
 * silently break smart routing without any other test surface noticing.
 */

import { describe, expect, it } from "vitest";

import type { SourceMap } from "@noverax/nexus-studio-core";
import { CatalogStore } from "../src/server/catalog";

function makeLayer(prefix: string): SourceMap {
  return {
    api: {
      baseURL: `http://${prefix}.example.com`,
      groups: {
        users: {
          prefix: `/${prefix}/users`,
          endpoints: {
            getAll: {
              type: "query",
              hasVariablesSchema: false,
              hasResponseSchema: false,
            },
          },
        },
      },
    },
  } as unknown as SourceMap;
}

describe("CatalogStore.getRuntimeLayer", () => {
  it("returns undefined for an unknown sessionId", () => {
    const store = new CatalogStore();
    expect(store.getRuntimeLayer("never-set")).toBeUndefined();
  });

  it("returns the SourceMap previously stored via setRuntimeLayer", () => {
    const store = new CatalogStore();
    const layer = makeLayer("a");
    store.setRuntimeLayer("session-a", layer);
    expect(store.getRuntimeLayer("session-a")).toBe(layer);
  });

  it("returns the most recent value when setRuntimeLayer is called twice with the same id", () => {
    const store = new CatalogStore();
    const first = makeLayer("first");
    const second = makeLayer("second");
    store.setRuntimeLayer("session-x", first);
    store.setRuntimeLayer("session-x", second);
    expect(store.getRuntimeLayer("session-x")).toBe(second);
  });

  it("returns undefined after removeRuntimeLayer clears the entry", () => {
    const store = new CatalogStore();
    store.setRuntimeLayer("temp", makeLayer("temp"));
    store.removeRuntimeLayer("temp");
    expect(store.getRuntimeLayer("temp")).toBeUndefined();
  });

  it("isolates different sessionIds — setting one does not affect another", () => {
    const store = new CatalogStore();
    const a = makeLayer("a");
    const b = makeLayer("b");
    store.setRuntimeLayer("a", a);
    store.setRuntimeLayer("b", b);
    expect(store.getRuntimeLayer("a")).toBe(a);
    expect(store.getRuntimeLayer("b")).toBe(b);
  });

  it("reads reflect writes immediately (no debounce on getRuntimeLayer)", () => {
    // The catalog snapshot emit is debounced 50 ms, but reads must be sync
    // — smart routing happens on the same tick as the playground:stream
    // socket event arrival.
    const store = new CatalogStore();
    const layer = makeLayer("immediate");
    store.setRuntimeLayer("imm", layer);
    expect(store.getRuntimeLayer("imm")).toBe(layer);
  });
});
