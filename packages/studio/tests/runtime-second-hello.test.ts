/**
 * A runtime socket speaks for one runtime. A second `runtime:hello` under
 * another id replaced the id the socket was known by, so its disconnect
 * released only the second: the first stayed registered and bound, its
 * sources routed to a socket that was gone.
 */
import type { Namespace } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BindingTable } from "../src/server/catalog/binding-table";
import { setupRuntimeNamespace } from "../src/server/runtime-namespace";
import { clearStudioServerState, getRuntimeEntry } from "../src/server/runtime-namespace-state";
import { FIXED_TOKEN, FIXED_TOKEN_VALUE } from "./helpers/fixed-token";

type Handler = (raw: unknown) => void;

function makeSocket(id: string) {
  const handlers = new Map<string, Handler>();
  return {
    id,
    connected: true,
    handshake: { auth: { token: FIXED_TOKEN_VALUE } },
    on(event: string, fn: Handler) {
      handlers.set(event, fn);
    },
    emit(event: string, raw?: unknown) {
      handlers.get(event)?.(raw);
    },
  };
}

function serve(): {
  bindingTable: BindingTable;
  connect(socket: ReturnType<typeof makeSocket>): void;
} {
  let onConnection: ((socket: unknown) => void) | undefined;
  const runtime = {
    on(event: string, fn: (socket: unknown) => void) {
      if (event === "connection") onConnection = fn;
    },
  } as unknown as Namespace;
  const bindingTable = new BindingTable();
  setupRuntimeNamespace(runtime, {
    bindingTable,
    token: FIXED_TOKEN,
    uiNamespace: { emit: vi.fn() } as unknown as Namespace,
  });
  return { bindingTable, connect: (socket) => onConnection?.(socket) };
}

afterEach(() => {
  clearStudioServerState();
  vi.restoreAllMocks();
});

describe("a second runtime:hello on one socket", () => {
  it("under another id is refused, and the socket keeps the runtime it named first", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { bindingTable, connect } = serve();
    const socket = makeSocket("one");
    connect(socket);
    socket.emit("runtime:hello", { runtimeId: "first", kind: "server" });
    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });

    socket.emit("runtime:hello", { runtimeId: "second", kind: "server" });

    expect(getRuntimeEntry("second")).toBeUndefined();
    expect(getRuntimeEntry("first")?.socket).toBe(socket);
    expect(bindingTable.resolveBinding("api", "http")?.runtimeId).toBe("first");
  });

  it("leaves nothing registered or bound once the socket goes", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { bindingTable, connect } = serve();
    const socket = makeSocket("one");
    connect(socket);
    socket.emit("runtime:hello", { runtimeId: "first", kind: "server" });
    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    socket.emit("runtime:hello", { runtimeId: "second", kind: "server" });

    socket.emit("disconnect");

    expect([getRuntimeEntry("first"), getRuntimeEntry("second")]).toEqual([undefined, undefined]);
    expect(bindingTable.resolveBinding("api", "http")).toBeNull();
  });

  it("under the same id registers the socket again", () => {
    const { connect } = serve();
    const socket = makeSocket("one");
    connect(socket);
    socket.emit("runtime:hello", { runtimeId: "first", kind: "server" });

    socket.emit("runtime:hello", { runtimeId: "first", kind: "server" });

    expect(getRuntimeEntry("first")?.socket).toBe(socket);
  });
});
