/**
 * Regression coverage for the fix that wires `handleReplay` through
 * `pickStreamTargetSocket` instead of always using `appSockets[0]`.
 *
 * Before the fix, replay handler always emitted `playground:execute` to
 * the first socket in the namespace. In a 2-app setup (e.g. standalone
 * WS-only server connected first + Next.js HTTP/SSE second), the WS-only
 * server received an HTTP replay request and silently dropped it. The user
 * saw "Application did not respond within 15s".
 *
 * The fix routes via `pickStreamTargetSocket` with the same smart-match
 * logic that `playground:stream` uses, including HTTP support (matches
 * endpoints with no `transport` field when payload also has no transport).
 */

import { describe, expect, it, vi } from "vitest";

import type { SourceMap } from "@noverax/nexus-studio-core";
import type { CatalogStore } from "../src/server/catalog";
import type { AppNamespace, AppSocket, AppSocketData } from "../src/server/socket-data";
import { handleReplay } from "../src/server/ui-replay-handler";

// ── Stub builders ──────────────────────────────────────────────────────────

function makeStubSocket(init: { sessionId?: string; framework?: string }): AppSocket {
  const data: AppSocketData = {};
  if (init.sessionId !== undefined) data.sessionId = init.sessionId;
  if (init.framework !== undefined) data.framework = init.framework;
  return { data, emit: vi.fn() } as unknown as AppSocket;
}

function makeStubNamespace(sockets: AppSocket[]): AppNamespace {
  const map = new Map<string, AppSocket>();
  sockets.forEach((s, i) => map.set(`s${i}`, s));
  return { sockets: map } as unknown as AppNamespace;
}

function makeStubCatalog(layers: Record<string, SourceMap>): CatalogStore {
  return {
    getRuntimeLayer: (sessionId: string) => layers[sessionId],
  } as unknown as CatalogStore;
}

const httpLayer: SourceMap = {
  api: {
    baseURL: "http://api",
    groups: {
      users: {
        prefix: "/users",
        endpoints: {
          // No `transport` field → HTTP endpoint
          getAll: { type: "query", hasVariablesSchema: false, hasResponseSchema: false },
        },
      },
    },
  },
} as unknown as SourceMap;

const wsOnlyLayer: SourceMap = {
  api: {
    baseURL: "http://api",
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

const replayHttpPayload = {
  source: "api",
  group: "users",
  method: "getAll",
  variables: { id: 1 },
  headers: {},
  mode: "direct" as const,
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("handleReplay — smart routing", () => {
  it("routes the replay to the HTTP-hosting app even when it is NOT first in the socket list", () => {
    // Reproduces the original bug: standalone WS-only server connected first,
    // Next.js HTTP host connected second. Pre-fix code would emit to socket[0]
    // (standalone), which silently drops HTTP requests.
    const standalone = makeStubSocket({ sessionId: "stand", framework: "server" });
    const nextjs = makeStubSocket({ sessionId: "next", framework: "next-server" });
    const ns = makeStubNamespace([standalone, nextjs]);
    const cat = makeStubCatalog({ stand: wsOnlyLayer, next: httpLayer });

    const callback = vi.fn();
    handleReplay(ns, cat)(replayHttpPayload, callback);

    expect(standalone.emit).not.toHaveBeenCalled();
    expect(nextjs.emit).toHaveBeenCalledWith(
      "playground:execute",
      expect.objectContaining({
        source: "api",
        group: "users",
        method: "getAll",
        mode: "direct",
      }),
      expect.any(Function),
    );
  });

  it("returns no-apps error when zero apps are connected", () => {
    const ns = makeStubNamespace([]);
    const cat = makeStubCatalog({});
    const callback = vi.fn();
    handleReplay(ns, cat)(replayHttpPayload, callback);

    expect(callback).toHaveBeenCalledWith({
      ok: false,
      error: "No application connected",
    });
  });

  it("returns no-host error with framework list when 2+ apps connected but none host the HTTP endpoint", () => {
    // Both apps host WS only — replay HTTP request has no app to land on.
    // Pre-fix this would silently route to socket[0] and the user would
    // wait 15s for a timeout error.
    const a = makeStubSocket({ sessionId: "a", framework: "next-server" });
    const b = makeStubSocket({ sessionId: "b", framework: "server" });
    const ns = makeStubNamespace([a, b]);
    const cat = makeStubCatalog({ a: wsOnlyLayer, b: wsOnlyLayer });

    const callback = vi.fn();
    handleReplay(ns, cat)(replayHttpPayload, callback);

    expect(a.emit).not.toHaveBeenCalled();
    expect(b.emit).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
    const result = callback.mock.calls[0]?.[0] as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No connected app hosts HTTP endpoint api.users.getAll");
    expect(result.error).toContain("next-server");
    expect(result.error).toContain("server");
  });

  it("trusts the only connected socket regardless of catalog match", () => {
    // Single-app case: even if the catalog doesn't have a runtime layer for
    // this app yet (cold start), we still route to it. The executor will
    // surface its own clean error.
    const only = makeStubSocket({ sessionId: "only", framework: "next-server" });
    const ns = makeStubNamespace([only]);
    const cat = makeStubCatalog({});

    const callback = vi.fn();
    handleReplay(ns, cat)(replayHttpPayload, callback);

    expect(only.emit).toHaveBeenCalledTimes(1);
  });
});
