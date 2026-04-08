/**
 * Tests for `sessionVersion` bumping in `app-namespace.ts`.
 *
 * The session-version registry is module-scoped, so each invocation of
 * `setupAppNamespace` shares the counter. We exercise it through a stub
 * Socket.IO namespace that captures the registered `connection` handler and
 * synthesizes `event` payloads against it — no real Socket.IO server.
 */

import { describe, expect, it, vi } from "vitest";

import type { Namespace } from "socket.io";
import { setupAppNamespace } from "../src/server/app-namespace";
import type { CatalogStore } from "../src/server/catalog";
import type { AppNamespace, AppSocket } from "../src/server/socket-data";
import type { SessionInfo } from "../src/server/types";

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

function sendInit(
  socket: StubSocket,
  sessionId: string,
): void {
  socket.handlers.event?.({
    type: "connection:init",
    sessionId,
    framework: "next-server",
    nexusVersion: "1.0.0",
  });
}

describe("sessionVersion — monotonic per sessionId", () => {
  it("starts at 1 for the first init of a sessionId", () => {
    const sessions = new Map<string, SessionInfo>();
    const { ns, connect } = makeStubAppNamespace();
    const ui = { emit: vi.fn() } as unknown as Namespace;
    setupAppNamespace(ns, ui, sessions, makeStubCatalog());

    const socket = makeStubSocket("s1");
    connect(socket);
    sendInit(socket, "first-session");

    expect(socket.data.sessionVersion).toBe(1);
    expect(sessions.get("first-session")?.sessionVersion).toBe(1);
  });

  it("bumps the version when a new connection reuses an existing sessionId", () => {
    const sessions = new Map<string, SessionInfo>();
    const { ns, connect } = makeStubAppNamespace();
    const ui = { emit: vi.fn() } as unknown as Namespace;
    setupAppNamespace(ns, ui, sessions, makeStubCatalog());

    const reused = "reused-session";
    const a = makeStubSocket("s1");
    connect(a);
    sendInit(a, reused);
    const aVer = a.data.sessionVersion;

    const b = makeStubSocket("s2");
    connect(b);
    sendInit(b, reused);

    expect(typeof aVer).toBe("number");
    expect(b.data.sessionVersion).toBe((aVer ?? 0) + 1);
    expect(sessions.get(reused)?.sessionVersion).toBe(b.data.sessionVersion);
  });

  it("increments independently per sessionId", () => {
    const sessions = new Map<string, SessionInfo>();
    const { ns, connect } = makeStubAppNamespace();
    const ui = { emit: vi.fn() } as unknown as Namespace;
    setupAppNamespace(ns, ui, sessions, makeStubCatalog());

    const a = makeStubSocket("s1");
    connect(a);
    sendInit(a, "indep-alpha");

    const b = makeStubSocket("s2");
    connect(b);
    sendInit(b, "indep-beta");

    expect(a.data.sessionVersion).toBe(1);
    expect(b.data.sessionVersion).toBe(1);
  });
});
