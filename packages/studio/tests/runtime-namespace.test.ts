import { afterEach, describe, expect, it, vi } from "vitest";
import { BindingTable } from "../src/server/catalog/binding-table";
import { setupRuntimeNamespace } from "../src/server/runtime-namespace";
import {
  clearStudioServerState,
  getRuntimeEntry,
  mockServers,
  socketMockServers,
} from "../src/server/runtime-namespace-state";

type Handler = (raw: unknown) => void;

interface FakeSocket {
  id: string;
  handlers: Map<string, Handler>;
  on(event: string, fn: Handler): void;
  emit(event: string, raw: unknown): void;
}

let socketIdCounter = 0;
function makeSocket(): FakeSocket {
  const handlers = new Map<string, Handler>();
  socketIdCounter += 1;
  return {
    id: `fake-socket-${socketIdCounter}`,
    handlers,
    on(event, fn) {
      handlers.set(event, fn);
    },
    emit(event, raw) {
      handlers.get(event)?.(raw);
    },
  };
}

interface FakeNamespace {
  emit: ReturnType<typeof vi.fn>;
  connect(socket: FakeSocket): void;
  _connection?: (socket: FakeSocket) => void;
}

function makeNamespace(): FakeNamespace {
  const ns = {
    emit: vi.fn(),
    connect(socket: FakeSocket) {
      ns._connection?.(socket);
    },
  } as FakeNamespace;
  return new Proxy(ns, {
    get(target, prop, receiver) {
      if (prop === "on") {
        return (event: string, fn: (socket: FakeSocket) => void) => {
          if (event === "connection") target._connection = fn;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as FakeNamespace;
}

afterEach(() => {
  socketIdCounter = 0;
  clearStudioServerState();
});

describe("setupRuntimeNamespace", () => {
  it("registers a runtime on hello and updates the binding table on announce", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    const ui = { emit: vi.fn() } as unknown as import("socket.io").Namespace;
    setupRuntimeNamespace(ns as unknown as import("socket.io").Namespace, {
      bindingTable,
      uiNamespace: ui,
    });

    const socket = makeSocket();
    ns.connect(socket);

    socket.emit("runtime:hello", { runtimeId: "next-server", kind: "server" });
    expect(getRuntimeEntry("next-server")?.kind).toBe("server");

    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    expect(bindingTable.resolveBinding("api", "http")?.runtimeId).toBe("next-server");
    expect((ui.emit as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "binding:snapshot",
      expect.objectContaining({
        rows: expect.any(Array),
        runtimeCount: expect.any(Number),
        sourceCount: expect.any(Number),
      }),
    );
  });

  it("ignores announce before hello", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    setupRuntimeNamespace(ns as unknown as import("socket.io").Namespace, { bindingTable });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    expect(bindingTable.resolveBinding("api", "http")).toBeNull();
  });

  it("rejects malformed hello payloads", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    setupRuntimeNamespace(ns as unknown as import("socket.io").Namespace, { bindingTable });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("runtime:hello", { runtimeId: "", kind: "server" });
    expect(getRuntimeEntry("")).toBeUndefined();
  });

  it("detaches the runtime from the binding table on disconnect", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    setupRuntimeNamespace(ns as unknown as import("socket.io").Namespace, { bindingTable });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("runtime:hello", { runtimeId: "next-server", kind: "server" });
    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    socket.emit("disconnect", undefined);
    expect(bindingTable.resolveBinding("api", "http")).toBeNull();
    expect(getRuntimeEntry("next-server")).toBeUndefined();
  });

  it("re-attaches with the new claim when announce arrives twice", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    setupRuntimeNamespace(ns as unknown as import("socket.io").Namespace, { bindingTable });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("runtime:hello", { runtimeId: "x", kind: "server" });
    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    socket.emit("runtime:announce", { transports: ["sse"], sources: ["api"] });
    expect(bindingTable.resolveBinding("api", "http")).toBeNull();
    expect(bindingTable.resolveBinding("api", "sse")?.runtimeId).toBe("x");
  });

  it("adopts listenOrigin from runtime:hello when announce never carries one", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    setupRuntimeNamespace(ns as unknown as import("socket.io").Namespace, { bindingTable });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("runtime:hello", {
      runtimeId: "browser-runtime",
      kind: "browser",
      listenOrigin: "http://localhost:5173",
    });
    expect(getRuntimeEntry("browser-runtime")?.listenOrigin).toBe("http://localhost:5173");
  });

  it("enriches binding:snapshot with appOrigin from the owning runtime listenOrigin", () => {
    const bindingTable = new BindingTable();
    bindingTable.setConfig({
      sources: {
        api: {
          options: { proxyPath: { http: "/api" } },
        },
      },
    } as unknown as import("@noverax/nexus/config").NexusConfig);
    const ns = makeNamespace();
    const ui = { emit: vi.fn() } as unknown as import("socket.io").Namespace;
    setupRuntimeNamespace(ns as unknown as import("socket.io").Namespace, {
      bindingTable,
      uiNamespace: ui,
    });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("runtime:hello", { runtimeId: "next-server", kind: "server" });
    socket.emit("runtime:announce", {
      transports: ["http"],
      sources: ["api"],
      listenOrigin: "http://127.0.0.1:3000",
    });

    const lastCall = (ui.emit as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("binding:snapshot");
    const payload = lastCall?.[1] as {
      rows: Array<Record<string, unknown>>;
      runtimeCount: number;
      sourceCount: number;
    };
    const row = payload.rows.find((r) => r.sourceName === "api" && r.transport === "http");
    expect(row?.status).toBe("bound");
    expect(row?.appOrigin).toBe("http://127.0.0.1:3000");
    expect(payload.runtimeCount).toBe(1);
    expect(payload.sourceCount).toBe(1);
  });

  it("dispatches mock:server:connect/disconnect events received on /runtime", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    setupRuntimeNamespace(ns as unknown as import("socket.io").Namespace, { bindingTable });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("event", {
      type: "mock:server:connect",
      serverId: "mock-1",
      sourceName: "api",
      port: 7001,
      url: "http://localhost:7001",
    });
    expect(mockServers.has("mock-1")).toBe(true);
    expect(socketMockServers.get(socket.id)?.has("mock-1")).toBe(true);

    socket.emit("event", {
      type: "mock:server:disconnect",
      serverId: "mock-1",
      sourceName: "api",
    });
    expect(mockServers.has("mock-1")).toBe(false);
  });

  it("releases mock servers owned by the socket on disconnect", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    setupRuntimeNamespace(ns as unknown as import("socket.io").Namespace, { bindingTable });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("event", {
      type: "mock:server:connect",
      serverId: "mock-2",
      sourceName: "api",
      port: 7002,
      url: "http://localhost:7002",
    });
    expect(mockServers.has("mock-2")).toBe(true);
    socket.emit("disconnect", undefined);
    expect(mockServers.has("mock-2")).toBe(false);
    expect(socketMockServers.has(socket.id)).toBe(false);
  });

  it("broadcasts /runtime mock events to the UI namespace through the funnel", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    const ui = { emit: vi.fn() } as unknown as import("socket.io").Namespace;
    setupRuntimeNamespace(ns as unknown as import("socket.io").Namespace, {
      bindingTable,
      uiNamespace: ui,
    });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("event", {
      type: "mock:server:connect",
      serverId: "mock-broadcast",
      sourceName: "api",
      port: 7003,
      url: "http://localhost:7003",
    });

    const eventCalls = (ui.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === "event",
    );
    expect(eventCalls.length).toBe(1);
    expect((eventCalls[0]?.[1] as Record<string, unknown>).serverId).toBe("mock-broadcast");
  });

  it("counts distinct runtimes and sources across bound rows", () => {
    const bindingTable = new BindingTable();
    bindingTable.setConfig({
      sources: {
        api: { options: { proxyPath: { http: "/api", sse: "/api/sse" } } },
        users: { options: { proxyPath: { http: "/users" } } },
      },
    } as unknown as import("@noverax/nexus/config").NexusConfig);
    const ns = makeNamespace();
    const ui = { emit: vi.fn() } as unknown as import("socket.io").Namespace;
    setupRuntimeNamespace(ns as unknown as import("socket.io").Namespace, {
      bindingTable,
      uiNamespace: ui,
    });

    const a = makeSocket();
    ns.connect(a);
    a.emit("runtime:hello", { runtimeId: "rt-a", kind: "server" });
    a.emit("runtime:announce", { transports: ["http", "sse"], sources: ["api"] });

    const b = makeSocket();
    ns.connect(b);
    b.emit("runtime:hello", { runtimeId: "rt-b", kind: "server" });
    b.emit("runtime:announce", { transports: ["http"], sources: ["users"] });

    const lastCall = (ui.emit as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => c[0] === "binding:snapshot")
      .at(-1);
    const payload = lastCall?.[1] as {
      rows: unknown[];
      runtimeCount: number;
      sourceCount: number;
    };
    expect(payload.runtimeCount).toBe(2);
    expect(payload.sourceCount).toBe(2);
  });

  it("stores listenOrigin and framework supplied via runtime:announce", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    setupRuntimeNamespace(ns as unknown as import("socket.io").Namespace, { bindingTable });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("runtime:hello", { runtimeId: "next-server", kind: "server" });
    socket.emit("runtime:announce", {
      transports: ["http", "sse"],
      sources: ["api"],
      listenOrigin: "http://127.0.0.1:3000",
      framework: "next",
    });
    const entry = getRuntimeEntry("next-server");
    expect(entry?.listenOrigin).toBe("http://127.0.0.1:3000");
    expect(entry?.framework).toBe("next");
  });
});
