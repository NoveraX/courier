/**
 * HMR survival + disconnect cleanup coverage for the three module-scoped
 * Maps in `app-namespace.ts`. Mirrors `playground-registry-hmr.test.ts` in
 * studio-core: two independent module loads (simulated via
 * `vi.resetModules`) must observe the same backing storage.
 *
 * Also covers the disconnect-handler regression where
 * `sessionVersionRegistry` was never cleared, allowing unbounded growth.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Namespace } from "socket.io";
import type { CatalogStore } from "../src/server/catalog";
import type { AppNamespace, AppSocket } from "../src/server/socket-data";
import type { SessionInfo } from "../src/server/types";

const MOCK_SERVERS_KEY = Symbol.for("nexus.studio.mock-servers");
const SOCKET_MOCK_SERVERS_KEY = Symbol.for("nexus.studio.socket-mock-servers");
const SESSION_VERSION_REGISTRY_KEY = Symbol.for("nexus.studio.session-version-registry");

const g = globalThis as Record<symbol, unknown>;

beforeEach(() => {
  delete g[MOCK_SERVERS_KEY];
  delete g[SOCKET_MOCK_SERVERS_KEY];
  delete g[SESSION_VERSION_REGISTRY_KEY];
  vi.resetModules();
});

afterEach(() => {
  delete g[MOCK_SERVERS_KEY];
  delete g[SOCKET_MOCK_SERVERS_KEY];
  delete g[SESSION_VERSION_REGISTRY_KEY];
});

describe("app-namespace globals — HMR survival", () => {
  it("mockServers Map is shared across module reloads", async () => {
    const first = await import("../src/server/app-namespace");
    expect(first.mockServers.size).toBe(0);

    first.mockServers.set("server-1", { serverId: "server-1", name: "alpha" });
    expect(first.mockServers.size).toBe(1);

    vi.resetModules();
    const second = await import("../src/server/app-namespace");
    expect(second.mockServers.size).toBe(1);
    expect(second.mockServers.get("server-1")).toEqual({
      serverId: "server-1",
      name: "alpha",
    });
  });

  it("socketMockServers and sessionVersionRegistry survive module reload", async () => {
    await import("../src/server/app-namespace");

    const socketMockServers = g[SOCKET_MOCK_SERVERS_KEY] as Map<string, Set<string>>;
    socketMockServers.set("socket-A", new Set(["srv-1", "srv-2"]));

    const sessionVersionRegistry = g[SESSION_VERSION_REGISTRY_KEY] as Map<string, number>;
    sessionVersionRegistry.set("sess-1", 7);

    vi.resetModules();
    await import("../src/server/app-namespace");

    expect((g[SOCKET_MOCK_SERVERS_KEY] as Map<string, Set<string>>).get("socket-A")).toEqual(
      new Set(["srv-1", "srv-2"]),
    );
    expect((g[SESSION_VERSION_REGISTRY_KEY] as Map<string, number>).get("sess-1")).toBe(7);
  });
});

interface StubSocket {
  data: AppSocket["data"];
  id: string;
  handshake: { headers: Record<string, string>; address: string };
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  emit: (...args: unknown[]) => void;
  handlers: Record<string, (...args: unknown[]) => void>;
}

function makeStubSocket(id: string): StubSocket {
  const s: StubSocket = {
    data: {},
    id,
    handshake: { headers: {}, address: "127.0.0.1" },
    handlers: {},
    on(event, handler) {
      s.handlers[event] = handler;
    },
    emit: vi.fn(),
  };
  return s;
}

function makeStubAppNamespace(): {
  ns: AppNamespace;
  connect: (s: StubSocket) => void;
} {
  let connectionHandler: ((s: StubSocket) => void) | undefined;
  const ns = {
    on(event: string, handler: (s: StubSocket) => void) {
      if (event === "connection") connectionHandler = handler;
    },
    emit: vi.fn(),
  } as unknown as AppNamespace;
  return {
    ns,
    connect(s) {
      connectionHandler?.(s);
    },
  };
}

function makeStubCatalog(): CatalogStore {
  return {
    onNamesChange: () => undefined,
    getNameMapping: () => ({}),
    setRuntimeLayer: () => undefined,
    removeRuntimeLayer: () => undefined,
  } as unknown as CatalogStore;
}

describe("app-namespace disconnect — sessionVersionRegistry cleanup", () => {
  it("removes sessionId from registry when its socket disconnects", async () => {
    const { setupAppNamespace } = await import("../src/server/app-namespace");
    const sessions = new Map<string, SessionInfo>();
    const { ns, connect } = makeStubAppNamespace();
    const ui = { emit: vi.fn() } as unknown as Namespace;
    setupAppNamespace(ns, ui, sessions, makeStubCatalog());

    const socket = makeStubSocket("s1");
    connect(socket);
    socket.handlers.event?.({
      type: "connection:init",
      sessionId: "cleanup-target",
      framework: "next-server",
      nexusVersion: "1.0.0",
    });

    const registry = g[SESSION_VERSION_REGISTRY_KEY] as Map<string, number>;
    expect(registry.has("cleanup-target")).toBe(true);

    socket.handlers.disconnect?.();

    expect(registry.has("cleanup-target")).toBe(false);
  });

  it("does not touch other sessions in the registry on disconnect", async () => {
    const { setupAppNamespace } = await import("../src/server/app-namespace");
    const sessions = new Map<string, SessionInfo>();
    const { ns, connect } = makeStubAppNamespace();
    const ui = { emit: vi.fn() } as unknown as Namespace;
    setupAppNamespace(ns, ui, sessions, makeStubCatalog());

    const a = makeStubSocket("s1");
    connect(a);
    a.handlers.event?.({
      type: "connection:init",
      sessionId: "keep-me",
      framework: "next-server",
      nexusVersion: "1.0.0",
    });

    const b = makeStubSocket("s2");
    connect(b);
    b.handlers.event?.({
      type: "connection:init",
      sessionId: "drop-me",
      framework: "next-server",
      nexusVersion: "1.0.0",
    });

    b.handlers.disconnect?.();

    const registry = g[SESSION_VERSION_REGISTRY_KEY] as Map<string, number>;
    expect(registry.has("keep-me")).toBe(true);
    expect(registry.has("drop-me")).toBe(false);
  });
});
