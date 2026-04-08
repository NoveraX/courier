/**
 * Tests for `playground-stream-routing` — the smart router that picks
 * the right user-app socket for a `playground:stream` event when multiple
 * apps are connected to the Studio server.
 *
 * Two layers of coverage:
 *
 *  1. **Pure helper** `runtimeLayerHostsEndpoint` — exercised directly
 *     against `SourceMap` fixtures, no Socket.IO needed.
 *  2. **Live router** `pickStreamTargetSocket` — exercised through stub
 *     `AppNamespace` instances backed by `Map<string, AppSocket>`. We
 *     do NOT spin up real Socket.IO — instead, we hand the function a
 *     namespace-shaped object whose `sockets` field returns our stubs,
 *     which is the only API surface the router actually uses.
 */

import { describe, expect, it, vi } from "vitest";

import type { SourceMap } from "@noverax/nexus-studio-core";
import type { CatalogStore } from "../src/server/catalog";
import {
  pickStreamTargetSocket,
  runtimeLayerHostsEndpoint,
  type PlaygroundStreamPayload,
} from "../src/server/playground-stream-routing";
import type { AppNamespace, AppSocket, AppSocketData } from "../src/server/socket-data";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeLayer(overrides?: Partial<SourceMap[string]>): SourceMap {
  return {
    api: {
      baseURL: "http://api.example.com",
      groups: {
        users: {
          prefix: "/users",
          endpoints: {
            getAll: {
              type: "query",
              hasVariablesSchema: false,
              hasResponseSchema: false,
            },
          },
        },
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
        chat: {
          prefix: "/chat",
          endpoints: {
            room: {
              type: "query",
              hasVariablesSchema: false,
              hasResponseSchema: false,
              transport: "ws",
            },
          },
        },
      },
      ...overrides,
    },
  } as unknown as SourceMap;
}

function payload(overrides: Partial<PlaygroundStreamPayload>): PlaygroundStreamPayload {
  return {
    source: "api",
    group: "notifications",
    method: "feed",
    transport: "sse",
    ...overrides,
  };
}

// ── runtimeLayerHostsEndpoint ───────────────────────────────────────────────

describe("runtimeLayerHostsEndpoint — happy path", () => {
  it("matches an SSE endpoint by source/group/method/transport", () => {
    expect(runtimeLayerHostsEndpoint(makeLayer(), payload({ transport: "sse" }))).toBe(true);
  });

  it("matches a WS endpoint", () => {
    expect(
      runtimeLayerHostsEndpoint(
        makeLayer(),
        payload({ group: "chat", method: "room", transport: "ws" }),
      ),
    ).toBe(true);
  });

  it("matches an HTTP endpoint when payload has no transport", () => {
    expect(
      runtimeLayerHostsEndpoint(
        makeLayer(),
        payload({ group: "users", method: "getAll", transport: undefined }),
      ),
    ).toBe(true);
  });
});

describe("runtimeLayerHostsEndpoint — negative cases", () => {
  it("rejects when source is missing from the layer", () => {
    expect(runtimeLayerHostsEndpoint(makeLayer(), payload({ source: "other" }))).toBe(false);
  });

  it("rejects when group is missing", () => {
    expect(runtimeLayerHostsEndpoint(makeLayer(), payload({ group: "missing" }))).toBe(false);
  });

  it("rejects when method is missing", () => {
    expect(runtimeLayerHostsEndpoint(makeLayer(), payload({ method: "missing" }))).toBe(false);
  });

  it("rejects SSE payload against a WS endpoint (transport mismatch)", () => {
    expect(
      runtimeLayerHostsEndpoint(
        makeLayer(),
        payload({ group: "chat", method: "room", transport: "sse" }),
      ),
    ).toBe(false);
  });

  it("rejects WS payload against an SSE endpoint", () => {
    expect(
      runtimeLayerHostsEndpoint(
        makeLayer(),
        payload({ group: "notifications", method: "feed", transport: "ws" }),
      ),
    ).toBe(false);
  });

  it("rejects HTTP payload (no transport) against an SSE endpoint", () => {
    expect(
      runtimeLayerHostsEndpoint(
        makeLayer(),
        payload({ group: "notifications", method: "feed", transport: undefined }),
      ),
    ).toBe(false);
  });

  it("rejects SSE payload against an HTTP endpoint (no transport on entry)", () => {
    expect(
      runtimeLayerHostsEndpoint(
        makeLayer(),
        payload({ group: "users", method: "getAll", transport: "sse" }),
      ),
    ).toBe(false);
  });
});

// ── Multi-app simulation (one app hosts SSE, another hosts WS) ──────────────

describe("runtimeLayerHostsEndpoint — split-host scenario (Next.js + standalone)", () => {
  // Simulates a split deployment: Next.js hosts HTTP/SSE, standalone server hosts WS.
  const nextjsLayer: SourceMap = {
    api: {
      baseURL: "http://api.example.com",
      groups: {
        users: {
          prefix: "/users",
          endpoints: {
            getAll: { type: "query", hasVariablesSchema: false, hasResponseSchema: false },
          },
        },
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
  } as unknown as SourceMap;

  const standaloneLayer: SourceMap = {
    api: {
      baseURL: "http://api.example.com",
      groups: {
        chat: {
          prefix: "/chat",
          endpoints: {
            room: {
              type: "query",
              hasVariablesSchema: false,
              hasResponseSchema: false,
              transport: "ws",
            },
          },
        },
      },
    },
  } as unknown as SourceMap;

  it("Next.js layer matches the SSE endpoint", () => {
    expect(
      runtimeLayerHostsEndpoint(
        nextjsLayer,
        payload({ group: "notifications", method: "feed", transport: "sse" }),
      ),
    ).toBe(true);
  });

  it("Next.js layer rejects the WS endpoint (not hosted)", () => {
    expect(
      runtimeLayerHostsEndpoint(
        nextjsLayer,
        payload({ group: "chat", method: "room", transport: "ws" }),
      ),
    ).toBe(false);
  });

  it("Standalone layer matches the WS endpoint", () => {
    expect(
      runtimeLayerHostsEndpoint(
        standaloneLayer,
        payload({ group: "chat", method: "room", transport: "ws" }),
      ),
    ).toBe(true);
  });

  it("Standalone layer rejects the SSE endpoint (not hosted)", () => {
    expect(
      runtimeLayerHostsEndpoint(
        standaloneLayer,
        payload({ group: "notifications", method: "feed", transport: "sse" }),
      ),
    ).toBe(false);
  });
});

// ── pickStreamTargetSocket — live router with stub Namespace ────────────────

interface StubAppSocketInit {
  sessionId?: string;
  framework?: string;
}

/** Build an `AppSocket`-shaped stub with the minimal API the router uses. */
function makeStubSocket(init: StubAppSocketInit): AppSocket {
  const data: AppSocketData = {};
  if (init.sessionId !== undefined) data.sessionId = init.sessionId;
  if (init.framework !== undefined) data.framework = init.framework;
  return { data, emit: vi.fn() } as unknown as AppSocket;
}

/** Build an `AppNamespace`-shaped stub backed by a `Map<id, AppSocket>`. */
function makeStubNamespace(sockets: AppSocket[]): AppNamespace {
  const map = new Map<string, AppSocket>();
  sockets.forEach((s, i) => map.set(`s${i}`, s));
  return { sockets: map } as unknown as AppNamespace;
}

/** Build a `CatalogStore`-shaped stub returning fixture layers per sessionId. */
function makeStubCatalog(layers: Record<string, SourceMap>): CatalogStore {
  return {
    getRuntimeLayer: (sessionId: string) => layers[sessionId],
  } as unknown as CatalogStore;
}

const ssePayload = (): PlaygroundStreamPayload =>
  payload({ group: "notifications", method: "feed", transport: "sse" });

const wsPayload = (): PlaygroundStreamPayload =>
  payload({ group: "chat", method: "room", transport: "ws" });

const layerWithSSE: SourceMap = {
  api: {
    baseURL: "http://api",
    groups: {
      notifications: {
        prefix: "/n",
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
} as unknown as SourceMap;

const layerWithWS: SourceMap = {
  api: {
    baseURL: "http://api",
    groups: {
      chat: {
        prefix: "/c",
        endpoints: {
          room: {
            type: "query",
            hasVariablesSchema: false,
            hasResponseSchema: false,
            transport: "ws",
          },
        },
      },
    },
  },
} as unknown as SourceMap;

describe("pickStreamTargetSocket — single-socket and empty cases", () => {
  it("returns kind:no-apps when zero sockets are connected", () => {
    const ns = makeStubNamespace([]);
    const cat = makeStubCatalog({});
    expect(pickStreamTargetSocket(ns, cat, ssePayload())).toEqual({ kind: "no-apps" });
  });

  it("returns kind:matched with the only socket regardless of catalog match", () => {
    const sock = makeStubSocket({ sessionId: "s1", framework: "next-server" });
    const ns = makeStubNamespace([sock]);
    // Catalog is empty — we still return the only available socket so the
    // executor can run and surface a clean error rather than dropping silently.
    const cat = makeStubCatalog({});
    const result = pickStreamTargetSocket(ns, cat, ssePayload());
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") expect(result.socket).toBe(sock);
  });
});

describe("pickStreamTargetSocket — smart match (1 of N hosts the endpoint)", () => {
  it("picks the socket whose runtime layer hosts the SSE endpoint", () => {
    const nextSocket = makeStubSocket({ sessionId: "next", framework: "next-server" });
    const standaloneSocket = makeStubSocket({ sessionId: "stand", framework: "server" });
    const ns = makeStubNamespace([standaloneSocket, nextSocket]);
    const cat = makeStubCatalog({ next: layerWithSSE, stand: layerWithWS });

    const result = pickStreamTargetSocket(ns, cat, ssePayload());
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") expect(result.socket).toBe(nextSocket);
  });

  it("picks the socket whose runtime layer hosts the WS endpoint", () => {
    const nextSocket = makeStubSocket({ sessionId: "next", framework: "next-server" });
    const standaloneSocket = makeStubSocket({ sessionId: "stand", framework: "server" });
    const ns = makeStubNamespace([nextSocket, standaloneSocket]);
    const cat = makeStubCatalog({ next: layerWithSSE, stand: layerWithWS });

    const result = pickStreamTargetSocket(ns, cat, wsPayload());
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") expect(result.socket).toBe(standaloneSocket);
  });

  it("returns the first match when multiple sockets host the same endpoint", () => {
    const a = makeStubSocket({ sessionId: "a", framework: "next-server" });
    const b = makeStubSocket({ sessionId: "b", framework: "server" });
    const ns = makeStubNamespace([a, b]);
    const cat = makeStubCatalog({ a: layerWithSSE, b: layerWithSSE });

    const result = pickStreamTargetSocket(ns, cat, ssePayload());
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") expect(result.socket).toBe(a);
  });
});

describe("pickStreamTargetSocket — no-host fallback", () => {
  // The previous behavior was to silently fall back to the first non-unknown
  // framework socket even when none of the connected apps hosted the
  // requested endpoint. The user saw a generic "endpoint not found" error
  // from a downstream executor instead of an actionable "this endpoint is
  // not hosted on any connected app" message. The fix surfaces a structured
  // `no-host` discriminator with the connected frameworks for diagnostics.

  it("returns kind:no-host when 2+ sockets connected but none hosts the requested endpoint", () => {
    const a = makeStubSocket({ sessionId: "a", framework: "next-server" });
    const b = makeStubSocket({ sessionId: "b", framework: "server" });
    // Both apps host WS but the request is for SSE — neither hosts it.
    const ns = makeStubNamespace([a, b]);
    const cat = makeStubCatalog({ a: layerWithWS, b: layerWithWS });

    const result = pickStreamTargetSocket(ns, cat, ssePayload());
    expect(result.kind).toBe("no-host");
    if (result.kind === "no-host") {
      expect(result.sampledFrameworks).toEqual(["next-server", "server"]);
    }
  });

  it("returns kind:no-host with empty catalog and 2+ sockets", () => {
    // Neither socket has a runtime layer in the catalog — pre-fix this
    // would silently route to the first non-unknown framework.
    const a = makeStubSocket({ sessionId: "a", framework: "next-server" });
    const b = makeStubSocket({ sessionId: "b", framework: "unknown" });
    const ns = makeStubNamespace([a, b]);
    const cat = makeStubCatalog({});

    const result = pickStreamTargetSocket(ns, cat, ssePayload());
    expect(result.kind).toBe("no-host");
    if (result.kind === "no-host") {
      expect(result.sampledFrameworks).toEqual(["next-server", "unknown"]);
    }
  });

  it("smart match wins over no-host fallback (priority preserved)", () => {
    // The matching socket has framework "unknown" — smart routing should still
    // pick it over the non-matching one with a "nicer" framework label.
    const matchingButUnknown = makeStubSocket({ sessionId: "m", framework: "unknown" });
    const niceFrameworkButNoMatch = makeStubSocket({
      sessionId: "n",
      framework: "next-server",
    });
    const ns = makeStubNamespace([niceFrameworkButNoMatch, matchingButUnknown]);
    const cat = makeStubCatalog({ m: layerWithSSE, n: layerWithWS });

    const result = pickStreamTargetSocket(ns, cat, ssePayload());
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") expect(result.socket).toBe(matchingButUnknown);
  });

  it("ignores sockets without sessionId during smart match", () => {
    const noSession = makeStubSocket({ framework: "server" });
    const withSession = makeStubSocket({ sessionId: "ok", framework: "next-server" });
    const ns = makeStubNamespace([noSession, withSession]);
    const cat = makeStubCatalog({ ok: layerWithSSE });

    const result = pickStreamTargetSocket(ns, cat, ssePayload());
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") expect(result.socket).toBe(withSession);
  });
});
