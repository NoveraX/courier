import type { CourierConfig } from "@noverax/courier/config";
import type { Namespace } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BindingTable } from "../src/server/catalog/binding-table";
import { TOKEN_PAGES } from "../src/server/live-events";
import { createAgentCalls } from "../src/server/mcp/agent-calls";
import { setupRuntimeNamespace } from "../src/server/runtime-namespace";
import { clearStudioServerState, getRuntimeEntry } from "../src/server/runtime-namespace-state";
import { FIXED_TOKEN, FIXED_TOKEN_VALUE } from "./helpers/fixed-token";

type Handler = (raw: unknown) => void;

interface FakeSocket {
  id: string;
  handshake: { auth: Record<string, unknown> };
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
    handshake: { auth: { token: FIXED_TOKEN_VALUE } },
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

/* What a runtime sends: the events of one turn as a JSON array, in UTF-8. */
function batch(...events: unknown[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(events));
}

/* A page with the token is open: it sees each event whole. */
const OPEN_PAGES = { rooms: new Map([[TOKEN_PAGES, new Set(["page-1"])]]) };

describe("setupRuntimeNamespace", () => {
  it("registers a runtime on hello and updates the binding table on announce", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    const ui = { emit: vi.fn() } as unknown as Namespace;
    setupRuntimeNamespace(ns as unknown as Namespace, {
      token: FIXED_TOKEN,
      bindingTable,
      uiNamespace: ui,
    });

    const socket = makeSocket();
    ns.connect(socket);

    socket.emit("runtime:hello", { runtimeId: "next-server", kind: "server" });
    expect(getRuntimeEntry("next-server")?.kind).toBe("server");

    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    expect(bindingTable.resolveBinding("api", "http")?.runtimeId).toBe("next-server");
    expect(ui.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
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
    setupRuntimeNamespace(ns as unknown as Namespace, {
      token: FIXED_TOKEN,
      bindingTable,
    });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    expect(bindingTable.resolveBinding("api", "http")).toBeNull();
  });

  it("rejects malformed hello payloads", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    setupRuntimeNamespace(ns as unknown as Namespace, {
      token: FIXED_TOKEN,
      bindingTable,
    });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("runtime:hello", { runtimeId: "", kind: "server" });
    expect(getRuntimeEntry("")).toBeUndefined();
  });

  it("detaches the runtime from the binding table on disconnect", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    setupRuntimeNamespace(ns as unknown as Namespace, {
      token: FIXED_TOKEN,
      bindingTable,
    });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("runtime:hello", { runtimeId: "next-server", kind: "server" });
    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    socket.emit("disconnect", undefined);
    expect(bindingTable.resolveBinding("api", "http")).toBeNull();
    expect(getRuntimeEntry("next-server")).toBeUndefined();
  });

  /* Adapters announce one transport each, so a second message adds to the
     first rather than replacing it. Asserting the opposite here is what let
     Studio show every transport but the last one as orphaned. */
  it("adds to the claim when announce arrives twice", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    setupRuntimeNamespace(ns as unknown as Namespace, {
      token: FIXED_TOKEN,
      bindingTable,
    });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("runtime:hello", { runtimeId: "x", kind: "server" });
    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    socket.emit("runtime:announce", { transports: ["sse"], sources: ["api"] });
    expect(bindingTable.resolveBinding("api", "http")?.runtimeId).toBe("x");
    expect(bindingTable.resolveBinding("api", "sse")?.runtimeId).toBe("x");
  });

  it("adopts listenOrigin from runtime:hello when announce never carries one", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    setupRuntimeNamespace(ns as unknown as Namespace, {
      token: FIXED_TOKEN,
      bindingTable,
    });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit("runtime:hello", {
      runtimeId: "browser-runtime",
      kind: "browser",
      listenOrigin: "http://localhost:5173",
    });
    expect(getRuntimeEntry("browser-runtime")?.listenOrigin).toBe("http://localhost:5173");
  });

  it("lists each runtime in binding:snapshot with the origin it said, bound to a source or not", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    const ui = { emit: vi.fn() } as unknown as Namespace;
    setupRuntimeNamespace(ns as unknown as Namespace, {
      token: FIXED_TOKEN,
      bindingTable,
      uiNamespace: ui,
    });

    const page = makeSocket();
    ns.connect(page);
    page.emit("runtime:hello", {
      runtimeId: "next-browser",
      kind: "browser",
      listenOrigin: "http://localhost:3000",
    });
    const server = makeSocket();
    ns.connect(server);
    server.emit("runtime:hello", { runtimeId: "next-server", kind: "server" });
    server.emit("runtime:announce", { transports: ["http"], sources: [] });

    const lastCall = (ui.emit as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    const payload = lastCall?.[1] as { runtimes: Array<Record<string, unknown>> };
    expect(payload.runtimes).toEqual([
      { runtimeId: "next-browser", kind: "browser", origin: "http://localhost:3000" },
      { runtimeId: "next-server", kind: "server" },
    ]);
  });

  it("enriches binding:snapshot with appOrigin from the owning runtime listenOrigin", () => {
    const bindingTable = new BindingTable();
    bindingTable.setConfig({
      sources: {
        api: {
          options: { proxyPath: { http: "/api" } },
        },
      },
    } as unknown as CourierConfig);
    const ns = makeNamespace();
    const ui = { emit: vi.fn() } as unknown as Namespace;
    setupRuntimeNamespace(ns as unknown as Namespace, {
      token: FIXED_TOKEN,
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

  it("broadcasts a runtime's request events to the UI, and none of the mock events no runtime sends", () => {
    const bindingTable = new BindingTable();
    const ns = makeNamespace();
    const ui = { emit: vi.fn() };
    /* The pages with the token, which see each event whole. */
    const pages = {
      ...ui,
      adapter: OPEN_PAGES,
      to: (room: string) => (room === TOKEN_PAGES ? ui : { emit: vi.fn() }),
    };
    setupRuntimeNamespace(ns as unknown as Namespace, {
      token: FIXED_TOKEN,
      bindingTable,
      uiNamespace: pages as unknown as Namespace,
    });

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit(
      "events",
      batch(
        { type: "mock:server:connect", serverId: "mock-1", port: 7001 },
        { type: "request:start", id: "r1", source: "api" },
      ),
    );

    const sent = ui.emit.mock.calls
      .filter(([name]) => name === "events")
      .flatMap(([, events]) => events);
    expect(sent).toEqual([expect.objectContaining({ type: "request:start", id: "r1" })]);
  });

  it("names the agent on a request Studio runs for one, in what the pages see and the log keeps", () => {
    const ns = makeNamespace();
    const ui = { emit: vi.fn() };
    const pages = {
      ...ui,
      adapter: OPEN_PAGES,
      to: (room: string) => (room === TOKEN_PAGES ? ui : { emit: vi.fn() }),
    };
    const kept: Record<string, unknown>[] = [];
    const agentCalls = createAgentCalls();
    setupRuntimeNamespace(ns as unknown as Namespace, {
      token: FIXED_TOKEN,
      bindingTable: new BindingTable(),
      uiNamespace: pages as unknown as Namespace,
      requestLog: { record: (event: Record<string, unknown>) => kept.push(event) } as never,
      agentCalls,
    });
    const agent = { tool: "replay_write", access: "destructive" as const, client: "editor 1" };
    agentCalls.expect("pg_1", agent);

    const socket = makeSocket();
    ns.connect(socket);
    socket.emit(
      "events",
      batch(
        { type: "request:start", id: "pg_1", source: "api" },
        { type: "request:start", id: "r2", source: "api" },
      ),
    );
    agentCalls.forget("pg_1");
    socket.emit("events", batch({ type: "request:start", id: "pg_1", source: "api" }));

    const sent = ui.emit.mock.calls
      .filter(([name]) => name === "events")
      .flatMap(([, events]) => events as Record<string, unknown>[]);
    expect(sent.map((event) => event.agent)).toEqual([agent, undefined, undefined]);
    expect(kept.map((event) => event.agent)).toEqual([agent, undefined, undefined]);
  });

  it("counts distinct runtimes and sources across bound rows", () => {
    const bindingTable = new BindingTable();
    bindingTable.setConfig({
      sources: {
        api: { options: { proxyPath: { http: "/api", sse: "/api/sse" } } },
        users: { options: { proxyPath: { http: "/users" } } },
      },
    } as unknown as CourierConfig);
    const ns = makeNamespace();
    const ui = { emit: vi.fn() } as unknown as Namespace;
    setupRuntimeNamespace(ns as unknown as Namespace, {
      token: FIXED_TOKEN,
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
    setupRuntimeNamespace(ns as unknown as Namespace, {
      token: FIXED_TOKEN,
      bindingTable,
    });

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
