/**
 * Two processes attached under one runtime id — two services left on the
 * default "server", cluster workers, two instances of one app.
 *
 * The first to disconnect removed the registry entry and the bindings of the
 * one still running, so its sources went orphan and the Playground answered
 * "No runtime hosts <source>" until it restarted.
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
});

describe("two processes under one runtime id", () => {
  it("keep the survivor registered and bound when the first disconnects", () => {
    const { bindingTable, connect } = serve();
    const first = makeSocket("first");
    const second = makeSocket("second");
    for (const socket of [first, second]) {
      connect(socket);
      socket.emit("runtime:hello", { runtimeId: "server", kind: "server" });
      socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    }

    first.emit("disconnect");

    expect(getRuntimeEntry("server")?.socket).toBe(second);
    expect(bindingTable.resolveBinding("api", "http")?.runtimeId).toBe("server");
  });

  it("keep the survivor when the newer one disconnects first", () => {
    const { bindingTable, connect } = serve();
    const first = makeSocket("first");
    const second = makeSocket("second");
    for (const socket of [first, second]) {
      connect(socket);
      socket.emit("runtime:hello", { runtimeId: "server", kind: "server" });
      socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    }

    second.emit("disconnect");

    expect(getRuntimeEntry("server")?.socket).toBe(first);
    expect(bindingTable.resolveBinding("api", "http")?.runtimeId).toBe("server");
  });

  it("let the runtime go once the last of them disconnects", () => {
    const { bindingTable, connect } = serve();
    const first = makeSocket("first");
    const second = makeSocket("second");
    for (const socket of [first, second]) {
      connect(socket);
      socket.emit("runtime:hello", { runtimeId: "server", kind: "server" });
      socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
    }

    first.emit("disconnect");
    second.emit("disconnect");

    expect(getRuntimeEntry("server")).toBeUndefined();
    expect(bindingTable.resolveBinding("api", "http")).toBeNull();
  });
});
