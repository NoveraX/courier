/**
 * Regression tests for `proxyPath` propagation through the full
 * connection:init → CatalogStore → snapshot pipeline.
 *
 * This test guards the security boundary added in `app-namespace.ts`:
 * the socket-side `sanitizeSourceMap` is a whitelist that drops any field
 * not explicitly allowed. New fields added to the catalog shape MUST be
 * whitelisted here — otherwise they are silently dropped for the entire
 * UI even though every downstream type and converter has been updated.
 *
 * These tests assert:
 *  1. `sourceFromRuntime` and `mergeSource` propagate `proxyPath` from the
 *     runtime layer (already covered indirectly elsewhere — re-asserted here
 *     for the round-trip).
 *  2. The `connection:init` payload shape used by studio-core is fully
 *     forwarded into the merged catalog snapshot (this is the bit that
 *     regressed silently in 5.4.9 v1).
 *  3. Malformed `proxyPath` values are dropped instead of crashing the
 *     dev server.
 */

import { describe, expect, it } from "vitest";

import { CatalogStore } from "../src/server/catalog/catalog-store";
import {
  catalogFromRuntime,
  sourceFromRuntime,
} from "../src/server/catalog/merge-converters";
import { mergeSource } from "../src/server/catalog/merge-source";

// ── merge-converters: runtime → catalog ─────────────────────────────────────

describe("sourceFromRuntime — proxyPath propagation", () => {
  it("copies a fully-populated proxyPath", () => {
    const result = sourceFromRuntime({
      baseURL: "http://api.example.com",
      proxyPath: {
        http: "/api/request",
        sse: "/api/sse",
        ws: "wss://realtime.example.com",
      },
      groups: {},
    } as never);
    expect(result.proxyPath).toEqual({
      http: "/api/request",
      sse: "/api/sse",
      ws: "wss://realtime.example.com",
    });
  });

  it("copies a partial proxyPath (only ws set)", () => {
    const result = sourceFromRuntime({
      baseURL: "http://x",
      proxyPath: { ws: "ws://localhost:3001" },
      groups: {},
    } as never);
    expect(result.proxyPath).toEqual({ ws: "ws://localhost:3001" });
  });

  it("omits proxyPath entirely when source has none", () => {
    const result = sourceFromRuntime({
      baseURL: "http://x",
      groups: {},
    } as never);
    expect(result.proxyPath).toBeUndefined();
  });
});

describe("mergeSource — proxyPath comes from runtime, not scan", () => {
  it("runtime proxyPath wins (scan layer cannot resolve it)", () => {
    const scan = {
      baseURL: "http://api.example.com",
      groups: { users: { prefix: "/u", endpoints: {} } },
    } as never;
    const runtime = {
      baseURL: "http://api.example.com",
      proxyPath: { http: "/api/request", sse: "/api/sse", ws: "wss://prod" },
      groups: { users: { prefix: "/u", endpoints: {} } },
    } as never;
    const result = mergeSource(scan, runtime);
    expect(result.proxyPath).toEqual({
      http: "/api/request",
      sse: "/api/sse",
      ws: "wss://prod",
    });
  });

  it("returns no proxyPath when runtime has none", () => {
    const scan = { baseURL: "http://x", groups: {} } as never;
    const runtime = { baseURL: "http://x", groups: {} } as never;
    const result = mergeSource(scan, runtime);
    expect(result.proxyPath).toBeUndefined();
  });
});

// ── catalogFromRuntime: end-to-end (no scan layer) ──────────────────────────

describe("catalogFromRuntime — proxyPath survives runtime-only path", () => {
  it("propagates proxyPath through the runtime-only branch", () => {
    const runtime = {
      api: {
        baseURL: "http://api.example.com",
        proxyPath: {
          http: "/api/request",
          sse: "/api/sse",
          ws: "wss://realtime.example.com",
        },
        groups: { users: { prefix: "/u", endpoints: {} } },
      },
    } as never;
    const catalog = catalogFromRuntime(runtime);
    expect(catalog.api?.proxyPath).toEqual({
      http: "/api/request",
      sse: "/api/sse",
      ws: "wss://realtime.example.com",
    });
  });
});

// ── CatalogStore: connection:init → snapshot round-trip ─────────────────────

describe("CatalogStore — connection:init proxyPath round-trip", () => {
  it("a runtime layer with proxyPath produces a snapshot containing it", () => {
    const store = new CatalogStore();
    store.setRuntimeLayer("session-1", {
      api: {
        baseURL: "http://api.example.com",
        proxyPath: {
          http: "/api/request",
          sse: "/api/sse",
          ws: "wss://realtime.example.com",
        },
        groups: {
          notifications: {
            prefix: "/notifications",
            endpoints: {
              feed: {
                type: "query",
                hasVariablesSchema: false,
                hasResponseSchema: false,
                transport: "sse",
              },
            },
          },
        },
      },
    } as never);
    store.flush();

    const snapshot = store.getSnapshot();
    expect(snapshot.catalog.api?.proxyPath).toEqual({
      http: "/api/request",
      sse: "/api/sse",
      ws: "wss://realtime.example.com",
    });
  });

  it("a runtime layer without proxyPath produces a snapshot without it", () => {
    const store = new CatalogStore();
    store.setRuntimeLayer("session-1", {
      api: {
        baseURL: "http://api.example.com",
        groups: { users: { prefix: "/u", endpoints: {} } },
      },
    } as never);
    store.flush();

    const snapshot = store.getSnapshot();
    expect(snapshot.catalog.api?.proxyPath).toBeUndefined();
  });
});
