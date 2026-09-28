/**
 * Adapters announce one transport at a time — `courierHandler` announces http,
 * `courierSSEHandler` sse, `courierWSAttach` ws. Each announce used to detach
 * everything the runtime had claimed before re-attaching, so only the last one
 * survived and Studio showed every other transport as orphaned.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Namespace } from "socket.io";

import { BindingTable } from "../src/server/catalog/binding-table";
import { setupRuntimeNamespace } from "../src/server/runtime-namespace";
import { clearStudioServerState } from "../src/server/runtime-namespace-state";
import { FIXED_TOKEN, FIXED_TOKEN_VALUE } from "./helpers/fixed-token";

type Handler = (raw: unknown) => void;

function makeSocket(id = "socket-1") {
  const handlers = new Map<string, Handler>();
  return {
    id,
    handshake: { auth: { token: FIXED_TOKEN_VALUE } },
    on(event: string, fn: Handler) {
      handlers.set(event, fn);
    },
    emit(event: string, raw?: unknown) {
      handlers.get(event)?.(raw);
    },
  };
}

function makeNamespace() {
  let connection: ((socket: unknown) => void) | undefined;
  return {
    emit: vi.fn(),
    on(event: string, fn: (socket: unknown) => void) {
      if (event === "connection") connection = fn;
    },
    connect(socket: unknown) {
      connection?.(socket);
    },
  };
}

function connected() {
  const bindingTable = new BindingTable();
  const ns = makeNamespace();
  const ui = { emit: vi.fn() } as unknown as Namespace;
  setupRuntimeNamespace(ns as unknown as Namespace, { bindingTable, token: FIXED_TOKEN, uiNamespace: ui });

  const socket = makeSocket();
  ns.connect(socket);
  socket.emit("runtime:hello", { runtimeId: "server", kind: "server" });
  return { bindingTable, socket };
}

afterEach(() => {
  clearStudioServerState();
});

describe("a runtime announcing one transport at a time", () => {
  it("keeps every transport it has announced", () => {
    const { bindingTable, socket } = connected();

    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    socket.emit("runtime:announce", { transports: ["sse"], sources: ["api"] });
    socket.emit("runtime:announce", { transports: ["ws"], sources: ["api"] });

    expect(bindingTable.resolveBinding("api", "http")?.runtimeId).toBe("server");
    expect(bindingTable.resolveBinding("api", "sse")?.runtimeId).toBe("server");
    expect(bindingTable.resolveBinding("api", "ws")?.runtimeId).toBe("server");
  });

  it("keeps the first one after a second arrives", () => {
    const { bindingTable, socket } = connected();

    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    socket.emit("runtime:announce", { transports: ["ws"], sources: ["api"] });

    expect(bindingTable.resolveBinding("api", "http")).not.toBeNull();
  });

  it("accumulates across sources too", () => {
    const { bindingTable, socket } = connected();

    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    socket.emit("runtime:announce", { transports: ["http"], sources: ["billing"] });

    expect(bindingTable.resolveBinding("api", "http")?.runtimeId).toBe("server");
    expect(bindingTable.resolveBinding("billing", "http")?.runtimeId).toBe("server");
  });

  it("announcing the same transport twice is not a conflict", () => {
    const { bindingTable, socket } = connected();

    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });

    expect(() => bindingTable.resolveBinding("api", "http")).not.toThrow();
  });

  /** Ownership is released when the runtime goes away, not on every message. */
  it("gives everything up on disconnect", () => {
    const { bindingTable, socket } = connected();

    socket.emit("runtime:announce", { transports: ["http", "sse"], sources: ["api"] });
    socket.emit("disconnect");

    expect(bindingTable.resolveBinding("api", "http")).toBeNull();
    expect(bindingTable.resolveBinding("api", "sse")).toBeNull();
  });
});
