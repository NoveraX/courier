/**
 * Unit tests for `resolveProxyPath` — the single point of truth for turning
 * a `ProxyPath` configuration into a concrete URL string per transport.
 *
 * Coverage matrix:
 *  - Built-in defaults for HTTP/SSE
 *  - Mandatory configuration for WS (no silent localhost fallback)
 *  - Absolute URL escape hatch on every transport
 *  - Relative path resolution against the runtime origin
 *  - SSR safety (PROXY_PATH_NO_ORIGIN when no origin available)
 *  - Defensive validation (empty string, protocol-relative, wrong scheme)
 *  - Error message contents that the user-facing UI relies on
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ConfigurationError, isConfigurationError } from "../src/errors";
import { mergeProxyPath } from "../src/proxy-caller/proxy-path";
import { resolveProxyPath } from "../src/proxy-caller/resolve-path";

const ORIGINAL_LOCATION = (globalThis as { location?: unknown }).location;

function setLocation(protocol: string, host: string): void {
  (globalThis as { location?: { protocol: string; host: string } }).location = { protocol, host };
}

function clearLocation(): void {
  delete (globalThis as { location?: unknown }).location;
}

beforeEach(() => {
  setLocation("https:", "app.example.com");
});

afterEach(() => {
  if (ORIGINAL_LOCATION === undefined) {
    clearLocation();
  } else {
    (globalThis as { location?: unknown }).location = ORIGINAL_LOCATION;
  }
});

// ── Built-in defaults ───────────────────────────────────────────────────────

describe("resolveProxyPath — built-in defaults", () => {
  it("HTTP defaults to /api/request resolved against location", () => {
    expect(resolveProxyPath("http", undefined)).toBe("https://app.example.com/api/request");
  });

  it("SSE defaults to /api/sse resolved against location", () => {
    expect(resolveProxyPath("sse", undefined)).toBe("https://app.example.com/api/sse");
  });

  it("WS has NO default — throws WS_PATH_NOT_CONFIGURED", () => {
    let caught: unknown;
    try {
      resolveProxyPath("ws", undefined);
    } catch (err) {
      caught = err;
    }
    expect(isConfigurationError(caught)).toBe(true);
    expect((caught as ConfigurationError).code).toBe("WS_PATH_NOT_CONFIGURED");
  });

  it("WS error message guides users to courier-server and proxyPath.ws", () => {
    expect(() => resolveProxyPath("ws", undefined)).toThrow(/proxyPath\.ws/);
    expect(() => resolveProxyPath("ws", undefined)).toThrow(/courier-server/);
  });
});

// ── Relative path overrides ─────────────────────────────────────────────────

describe("resolveProxyPath — relative paths", () => {
  it("HTTP relative override resolves against location", () => {
    expect(resolveProxyPath("http", { http: "/custom/proxy" })).toBe(
      "https://app.example.com/custom/proxy",
    );
  });

  it("SSE relative override resolves against location", () => {
    expect(resolveProxyPath("sse", { sse: "/v2/sse" })).toBe("https://app.example.com/v2/sse");
  });

  it("WS relative path on https origin promotes to wss://", () => {
    setLocation("https:", "app.example.com");
    expect(resolveProxyPath("ws", { ws: "/api/ws" })).toBe("wss://app.example.com/api/ws");
  });

  it("WS relative path on http origin uses ws://", () => {
    setLocation("http:", "localhost:3000");
    expect(resolveProxyPath("ws", { ws: "/api/ws" })).toBe("ws://localhost:3000/api/ws");
  });
});

// ── Absolute URL escape hatch ───────────────────────────────────────────────

describe("resolveProxyPath — absolute URLs", () => {
  it("HTTP absolute URL is returned as-is (cross-origin BFF / CDN)", () => {
    expect(resolveProxyPath("http", { http: "https://cdn.example.com/api/request" })).toBe(
      "https://cdn.example.com/api/request",
    );
  });

  it("SSE absolute URL is returned as-is (separate realtime host)", () => {
    expect(resolveProxyPath("sse", { sse: "https://realtime.example.com/sse" })).toBe(
      "https://realtime.example.com/sse",
    );
  });

  it("WS absolute wss:// URL is returned as-is (Next.js / serverless scenario)", () => {
    expect(resolveProxyPath("ws", { ws: "wss://realtime.example.com" })).toBe(
      "wss://realtime.example.com",
    );
  });

  it("WS absolute ws:// URL is returned as-is (local dev)", () => {
    expect(resolveProxyPath("ws", { ws: "ws://localhost:3001" })).toBe("ws://localhost:3001");
  });

  it("HTTP rejects ws:// scheme", () => {
    expect(() => resolveProxyPath("http", { http: "ws://x" })).toThrow(/http:\/\/ or https:\/\//);
  });

  it("WS rejects http:// scheme", () => {
    expect(() => resolveProxyPath("ws", { ws: "http://x" })).toThrow(/ws:\/\/ or wss:\/\//);
  });
});

// ── SSR safety / explicit origin ────────────────────────────────────────────

describe("resolveProxyPath — origin handling", () => {
  it("uses explicit origin when provided (Studio SSR)", () => {
    clearLocation();
    expect(
      resolveProxyPath("http", undefined, { protocol: "http:", host: "studio.dev:7050" }),
    ).toBe("http://studio.dev:7050/api/request");
  });

  it("throws PROXY_PATH_NO_ORIGIN when location is absent and no origin injected", () => {
    clearLocation();
    let caught: unknown;
    try {
      resolveProxyPath("http", { http: "/api/request" });
    } catch (err) {
      caught = err;
    }
    expect(isConfigurationError(caught)).toBe(true);
    expect((caught as ConfigurationError).code).toBe("PROXY_PATH_NO_ORIGIN");
  });

  it("absolute URLs are immune to missing origin", () => {
    clearLocation();
    expect(resolveProxyPath("http", { http: "https://cdn.example.com/api" })).toBe(
      "https://cdn.example.com/api",
    );
    expect(resolveProxyPath("ws", { ws: "wss://realtime.example.com" })).toBe(
      "wss://realtime.example.com",
    );
  });
});

// ── Defensive validation ────────────────────────────────────────────────────

describe("resolveProxyPath — invalid inputs", () => {
  it("empty string is treated as misconfiguration (not as 'use default')", () => {
    expect(() => resolveProxyPath("http", { http: "" })).toThrow(/cannot be an empty string/);
    expect(() => resolveProxyPath("ws", { ws: "" })).toThrow(/cannot be an empty string/);
  });

  it("protocol-relative URLs are rejected in v1", () => {
    expect(() => resolveProxyPath("http", { http: "//cdn.example.com/api" })).toThrow(
      /protocol-relative/,
    );
  });

  it("relative path without leading slash is rejected", () => {
    expect(() => resolveProxyPath("http", { http: "api/request" })).toThrow(/must start with "\/"/);
  });

  it("invalid inputs throw ConfigurationError with PROXY_PATH_INVALID code", () => {
    let caught: unknown;
    try {
      resolveProxyPath("http", { http: "" });
    } catch (err) {
      caught = err;
    }
    expect(isConfigurationError(caught)).toBe(true);
    expect((caught as ConfigurationError).code).toBe("PROXY_PATH_INVALID");
  });
});

// ── mergeProxyPath ──────────────────────────────────────────────────────────

describe("mergeProxyPath — per-transport precedence", () => {
  it("returns undefined when both sides are undefined", () => {
    expect(mergeProxyPath(undefined, undefined)).toBeUndefined();
  });

  it("returns source-only proxyPath when caller is undefined", () => {
    const source = { http: "/api/request", sse: "/api/sse", ws: "wss://prod.example.com" };
    expect(mergeProxyPath(undefined, source)).toEqual(source);
  });

  it("returns caller-only proxyPath when source is undefined", () => {
    const caller = { http: "/api/x", sse: "/api/y", ws: "wss://x" };
    expect(mergeProxyPath(caller, undefined)).toEqual(caller);
  });

  it("caller field overrides source field on a per-transport basis", () => {
    const source = { http: "/api/request", sse: "/api/sse", ws: "wss://prod.example.com" };
    const caller = { ws: "ws://localhost:3001" };
    expect(mergeProxyPath(caller, source)).toEqual({
      http: "/api/request",
      sse: "/api/sse",
      ws: "ws://localhost:3001",
    });
  });

  it("merges only the http field when caller specifies http only", () => {
    const source = { http: "/api/request", sse: "/api/sse" };
    const caller = { http: "https://cdn.example.com/api" };
    expect(mergeProxyPath(caller, source)).toEqual({
      http: "https://cdn.example.com/api",
      sse: "/api/sse",
      ws: undefined,
    });
  });

  it("merges only the sse field when caller specifies sse only", () => {
    const source = { http: "/api/request", sse: "/api/sse", ws: "wss://prod" };
    const caller = { sse: "https://realtime.example.com/sse" };
    expect(mergeProxyPath(caller, source)).toEqual({
      http: "/api/request",
      sse: "https://realtime.example.com/sse",
      ws: "wss://prod",
    });
  });

  it("preserves source.http when caller passes empty object", () => {
    const source = { http: "/api/request", sse: "/api/sse", ws: "wss://prod" };
    expect(mergeProxyPath({}, source)).toEqual(source);
  });

  it("merged result feeds resolveProxyPath correctly", () => {
    // End-to-end: defineApi sets ws=prod, caller overrides ws=dev,
    // resolveProxyPath returns the dev URL.
    const source = { http: "/api/request", sse: "/api/sse", ws: "wss://prod.example.com" };
    const caller = { ws: "ws://localhost:3001" };
    const merged = mergeProxyPath(caller, source);
    expect(resolveProxyPath("ws", merged)).toBe("ws://localhost:3001");
    expect(resolveProxyPath("http", merged)).toMatch(/\/api\/request$/);
  });

  it("does not mutate the source object", () => {
    const source = { http: "/api/request", sse: "/api/sse", ws: "wss://prod" };
    const sourceCopy = { ...source };
    const caller = { ws: "ws://localhost:3001" };
    mergeProxyPath(caller, source);
    expect(source).toEqual(sourceCopy);
  });

  it("does not mutate the caller object", () => {
    const source = { http: "/api/request" };
    const caller = { ws: "ws://localhost:3001" };
    const callerCopy = { ...caller };
    mergeProxyPath(caller, source);
    expect(caller).toEqual(callerCopy);
  });
});
