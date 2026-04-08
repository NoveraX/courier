/**
 * Tests for the SourceMap whitelist sanitizer that runs on every
 * `connection:init` / `connection:sources` socket event.
 *
 * The sanitizer is the security boundary between connected user apps
 * (which may run any Nexus version) and the catalog merge pipeline. Every
 * field carried in `SourceMap[string]` must have an explicit positive
 * test here — otherwise a future field can silently regress through the
 * whitelist.
 */

import { describe, expect, it } from "vitest";

import {
  sanitizeAppOrigin,
  sanitizeEnv,
  sanitizeProxyPath,
  sanitizeSourceMap,
} from "../src/server/sanitize-source-map";

// ── sanitizeEnv ─────────────────────────────────────────────────────────────

describe("sanitizeEnv", () => {
  it("returns undefined for null / undefined / non-object", () => {
    expect(sanitizeEnv(null)).toBeUndefined();
    expect(sanitizeEnv(undefined)).toBeUndefined();
    expect(sanitizeEnv("KEY=val")).toBeUndefined();
    expect(sanitizeEnv(42)).toBeUndefined();
  });

  it("returns undefined for empty object", () => {
    expect(sanitizeEnv({})).toBeUndefined();
  });

  it("forwards a fully string-valued env map", () => {
    expect(sanitizeEnv({ NODE_ENV: "production", PORT: "3000" })).toEqual({
      NODE_ENV: "production",
      PORT: "3000",
    });
  });

  it("drops non-string values silently", () => {
    expect(
      sanitizeEnv({
        OK: "yes",
        NUMERIC: 42,
        BOOL: true,
        NESTED: { x: 1 },
        NULLISH: null,
      }),
    ).toEqual({ OK: "yes" });
  });

  it("returns undefined when every value is non-string", () => {
    expect(sanitizeEnv({ A: 1, B: false, C: null })).toBeUndefined();
  });

  it("preserves empty-string env values (a valid setting)", () => {
    expect(sanitizeEnv({ EMPTY: "", FILLED: "x" })).toEqual({ EMPTY: "", FILLED: "x" });
  });
});

// ── sanitizeProxyPath ───────────────────────────────────────────────────────

describe("sanitizeProxyPath", () => {
  it("returns undefined for null / undefined / non-object", () => {
    expect(sanitizeProxyPath(null)).toBeUndefined();
    expect(sanitizeProxyPath(undefined)).toBeUndefined();
    expect(sanitizeProxyPath("string")).toBeUndefined();
    expect(sanitizeProxyPath(42)).toBeUndefined();
  });

  it("returns undefined for empty object", () => {
    expect(sanitizeProxyPath({})).toBeUndefined();
  });

  it("forwards a fully populated proxyPath", () => {
    expect(
      sanitizeProxyPath({
        http: "/api/request",
        sse: "/api/sse",
        ws: "wss://realtime.example.com",
      }),
    ).toEqual({
      http: "/api/request",
      sse: "/api/sse",
      ws: "wss://realtime.example.com",
    });
  });

  it("forwards partial proxyPath (only ws)", () => {
    expect(sanitizeProxyPath({ ws: "ws://localhost:3001" })).toEqual({
      ws: "ws://localhost:3001",
    });
  });

  it("drops non-string field values", () => {
    expect(
      sanitizeProxyPath({
        http: 42,
        sse: { nested: "object" },
        ws: "wss://valid.example.com",
      }),
    ).toEqual({ ws: "wss://valid.example.com" });
  });

  it("returns undefined when every field is invalid", () => {
    expect(sanitizeProxyPath({ http: 1, sse: true, ws: null })).toBeUndefined();
  });

  it("preserves the empty-string sentinel as-is (caller decides via resolveProxyPath)", () => {
    // Empty string is a *configuration error* that resolveProxyPath catches
    // with PROXY_PATH_INVALID; the sanitizer's job is to forward the user's
    // intent, not silently swallow it. Asserts the contract.
    expect(sanitizeProxyPath({ http: "" })).toBeUndefined();
  });
});

// ── sanitizeAppOrigin ───────────────────────────────────────────────────────

describe("sanitizeAppOrigin", () => {
  it("forwards a valid non-empty string", () => {
    expect(sanitizeAppOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("returns undefined for empty string", () => {
    // Empty string would render as a degenerate prefix when joined with a
    // relative path; treat as not configured.
    expect(sanitizeAppOrigin("")).toBeUndefined();
  });

  it("returns undefined for non-string values", () => {
    expect(sanitizeAppOrigin(undefined)).toBeUndefined();
    expect(sanitizeAppOrigin(null)).toBeUndefined();
    expect(sanitizeAppOrigin(42)).toBeUndefined();
    expect(sanitizeAppOrigin({ host: "localhost" })).toBeUndefined();
    expect(sanitizeAppOrigin(["http://localhost:3000"])).toBeUndefined();
  });
});

// ── sanitizeSourceMap ───────────────────────────────────────────────────────

describe("sanitizeSourceMap — proxyPath propagation", () => {
  it("forwards proxyPath into the resulting SourceMap entry", () => {
    const result = sanitizeSourceMap({
      api: {
        baseURL: "http://api.example.com",
        proxyPath: {
          http: "/api/request",
          sse: "/api/sse",
          ws: "wss://realtime.example.com",
        },
        groups: {},
      },
    });
    expect(result?.api?.proxyPath).toEqual({
      http: "/api/request",
      sse: "/api/sse",
      ws: "wss://realtime.example.com",
    });
  });

  it("omits proxyPath entirely when source has none", () => {
    const result = sanitizeSourceMap({
      api: { baseURL: "http://x", groups: {} },
    });
    expect(result?.api).toBeDefined();
    expect(result?.api?.proxyPath).toBeUndefined();
  });

  it("partial proxyPath forwards only valid fields", () => {
    const result = sanitizeSourceMap({
      api: {
        baseURL: "http://x",
        proxyPath: { ws: "ws://localhost:3001", http: 42 },
        groups: {},
      },
    });
    expect(result?.api?.proxyPath).toEqual({ ws: "ws://localhost:3001" });
  });

  it("malformed proxyPath shape does not crash and source still passes through", () => {
    const result = sanitizeSourceMap({
      api: {
        baseURL: "http://x",
        proxyPath: "not-an-object",
        groups: {},
      },
    });
    expect(result?.api).toBeDefined();
    expect(result?.api?.proxyPath).toBeUndefined();
  });
});

describe("sanitizeSourceMap — appOrigin propagation", () => {
  it("forwards appOrigin into the resulting SourceMap entry", () => {
    const result = sanitizeSourceMap({
      api: {
        baseURL: "http://api.example.com",
        appOrigin: "http://localhost:3000",
        groups: {},
      },
    });
    expect(result?.api?.appOrigin).toBe("http://localhost:3000");
  });

  it("omits appOrigin entirely when source has none", () => {
    const result = sanitizeSourceMap({
      api: { baseURL: "http://x", groups: {} },
    });
    expect(result?.api).toBeDefined();
    expect(result?.api?.appOrigin).toBeUndefined();
  });

  it("drops empty-string appOrigin", () => {
    const result = sanitizeSourceMap({
      api: { baseURL: "http://x", appOrigin: "", groups: {} },
    });
    expect(result?.api?.appOrigin).toBeUndefined();
  });

  it("drops non-string appOrigin and source still passes through", () => {
    const result = sanitizeSourceMap({
      api: { baseURL: "http://x", appOrigin: { host: "localhost" }, groups: {} },
    });
    expect(result?.api).toBeDefined();
    expect(result?.api?.appOrigin).toBeUndefined();
  });

  it("appOrigin and proxyPath coexist on the same source entry", () => {
    const result = sanitizeSourceMap({
      api: {
        baseURL: "http://x",
        appOrigin: "http://localhost:3000",
        proxyPath: { http: "/api/request", sse: "/api/sse" },
        groups: {},
      },
    });
    expect(result?.api?.appOrigin).toBe("http://localhost:3000");
    expect(result?.api?.proxyPath).toEqual({ http: "/api/request", sse: "/api/sse" });
  });
});

describe("sanitizeSourceMap — pre-existing safety contracts", () => {
  it("returns undefined for non-object input", () => {
    expect(sanitizeSourceMap(null)).toBeUndefined();
    expect(sanitizeSourceMap("string")).toBeUndefined();
  });

  it("returns undefined for empty object", () => {
    expect(sanitizeSourceMap({})).toBeUndefined();
  });

  it("drops entries that are not plain objects", () => {
    const result = sanitizeSourceMap({
      api: { baseURL: "http://x", groups: {} },
      bad: "string-value",
      worse: null,
    });
    expect(Object.keys(result ?? {})).toEqual(["api"]);
  });

  it("coerces missing baseURL to empty string", () => {
    const result = sanitizeSourceMap({ api: { groups: {} } });
    expect(result?.api?.baseURL).toBe("");
  });

  it("coerces missing groups to empty record", () => {
    const result = sanitizeSourceMap({ api: { baseURL: "http://x" } });
    expect(result?.api?.groups).toEqual({});
  });
});
