/**
 * Which runtimes Studio sends Playground calls to. Any process on the machine
 * can open a socket to `/runtime` and claim a source, and a call hands the
 * runtime the headers typed into it — tokens among them. Only a runtime that
 * presented this project's Studio token when it connected is sent calls.
 */
import type { Namespace } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BindingTable } from "../src/server/catalog/binding-table";
import { setupRuntimeNamespace } from "../src/server/runtime-namespace";
import { clearStudioServerState, getRuntimeEntry } from "../src/server/runtime-namespace-state";
import { createRuntimePlaygroundRouter } from "../src/server/runtime-playground-router";
import { admitRuntimeSocket, isTrustedRuntime } from "../src/server/runtime-trust";
import { FIXED_TOKEN, FIXED_TOKEN_VALUE } from "./helpers/fixed-token";

type Handler = (raw: unknown) => void;

function makeSocket(id: string, token?: string) {
  const handlers = new Map<string, Handler>();
  return {
    id,
    connected: true,
    handshake: { auth: token === undefined ? {} : { token } },
    emit: vi.fn((event: string, raw?: unknown) => handlers.get(event)?.(raw)),
    on(event: string, fn: Handler) {
      handlers.set(event, fn);
    },
  };
}

type FakeSocket = ReturnType<typeof makeSocket>;

function serve() {
  let onConnection: ((socket: FakeSocket) => void) | undefined;
  const runtime = {
    on: (event: string, fn: (socket: FakeSocket) => void) => {
      if (event === "connection") onConnection = fn;
    },
  } as unknown as Namespace;
  const ui = makeSocket("ui");
  const uiNamespace = { to: () => ({ emit: ui.emit }), emit: vi.fn() } as unknown as Namespace;
  const bindingTable = new BindingTable();
  const router = createRuntimePlaygroundRouter({ bindingTable, uiNamespace });
  setupRuntimeNamespace(runtime, {
    bindingTable,
    uiNamespace,
    playgroundRouter: router,
    token: FIXED_TOKEN,
  });

  function attach(socket: FakeSocket, runtimeId: string): void {
    onConnection?.(socket);
    socket.emit("runtime:hello", { runtimeId, kind: "server" });
    socket.emit("runtime:announce", { transports: ["http"], sources: ["api"] });
  }

  function call(): void {
    router.dispatch(ui as never, {
      rid: "rid-1",
      source: "api",
      group: "items",
      method: "list",
      transport: "http",
    });
  }

  return { attach, call, ui };
}

function executed(socket: FakeSocket): boolean {
  return socket.emit.mock.calls.some(([event]) => event === "playground:execute");
}

function refusals(ui: FakeSocket): string[] {
  return ui.emit.mock.calls
    .filter(([event]) => event === "playground:error")
    .map(([, payload]) => String((payload as { error: { message: string } }).error.message));
}

afterEach(() => {
  clearStudioServerState();
  vi.restoreAllMocks();
});

describe("a runtime socket", () => {
  it("is trusted when it presents the project's token, and not otherwise", () => {
    const presented = makeSocket("a", FIXED_TOKEN_VALUE);
    const wrong = makeSocket("b", "x".repeat(43));
    const none = makeSocket("c");

    expect(admitRuntimeSocket(presented as never, FIXED_TOKEN)).toBe(true);
    expect(admitRuntimeSocket(wrong as never, FIXED_TOKEN)).toBe(false);
    expect(admitRuntimeSocket(none as never, FIXED_TOKEN)).toBe(false);
    expect(isTrustedRuntime(presented as never)).toBe(true);
    expect(isTrustedRuntime(wrong as never)).toBe(false);
  });
});

describe("a Playground call", () => {
  it("is refused, saying why, when the runtime hosting the source has no token", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { attach, call, ui } = serve();
    const impostor = makeSocket("impostor");
    attach(impostor, "server");

    call();

    expect(executed(impostor)).toBe(false);
    expect(refusals(ui)).toEqual([expect.stringContaining("did not present this project's Studio token")]);
  });

  it("goes to the runtime with the token when another claims the source without it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { attach, call, ui } = serve();
    const server = makeSocket("server-socket", FIXED_TOKEN_VALUE);
    const impostor = makeSocket("impostor");
    attach(server, "server");
    attach(impostor, "impostor");

    call();

    expect(executed(server)).toBe(true);
    expect(executed(impostor)).toBe(false);
    expect(refusals(ui)).toEqual([]);
  });

  it("is not sent to a socket without the token that is left holding a runtime's id", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { attach, call, ui } = serve();
    const server = makeSocket("server-socket", FIXED_TOKEN_VALUE);
    const impostor = makeSocket("impostor");
    attach(server, "server");
    attach(impostor, "server");

    server.emit("disconnect");
    call();

    expect(getRuntimeEntry("server")?.socket).toBe(impostor);
    expect(executed(impostor)).toBe(false);
    expect(refusals(ui)).toEqual([expect.stringContaining("did not present this project's Studio token")]);
  });

  it("goes to the runtime with the token when one without it took the runtime's id first", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { attach, call, ui } = serve();
    const impostor = makeSocket("impostor");
    const server = makeSocket("server-socket", FIXED_TOKEN_VALUE);
    attach(impostor, "server");
    attach(server, "server");

    call();

    expect(getRuntimeEntry("server")?.socket).toBe(server);
    expect(executed(server)).toBe(true);
    expect(executed(impostor)).toBe(false);
    expect(refusals(ui)).toEqual([]);
  });
});
