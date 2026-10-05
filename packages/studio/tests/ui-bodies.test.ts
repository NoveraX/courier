import type { Socket } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runtimeRegistry } from "../src/server/runtime-namespace-state";
import { bindBodies } from "../src/server/ui-bodies";

/* A page's socket: the handlers Studio binds on it, called as the page would. */
function pageSocket() {
  const handlers = new Map<string, (raw: unknown, ack?: unknown) => unknown>();
  const socket = {
    on: (event: string, handler: (raw: unknown, ack?: unknown) => unknown) => {
      handlers.set(event, handler);
    },
  };
  const ask = async (event: string, raw: unknown): Promise<unknown> =>
    new Promise((resolve) => {
      void handlers.get(event)?.(raw, resolve);
    });
  return { socket: socket as unknown as Socket, ask };
}

/* The runtime an app attached with: it answers `runtime:body` as `reply` says. */
function attachRuntime(reply: (payload: unknown) => [Error | null, unknown]) {
  const emitted: unknown[] = [];
  const socket = {
    connected: true,
    timeout: () => ({
      emit: (
        _event: string,
        payload: unknown,
        answer: (error: Error | null, r: unknown) => void,
      ) => {
        emitted.push(payload);
        answer(...reply(payload));
      },
    }),
  };
  runtimeRegistry.set("app", {
    runtimeId: "app",
    kind: "server",
    socket: socket as unknown as Socket,
    transports: [],
    sourceNames: [],
  });
  return emitted;
}

afterEach(() => {
  runtimeRegistry.delete("app");
});

describe("a page that asks for a request's whole body", () => {
  it("is sent a mock's body, which the mock is asked for", async () => {
    const { socket, ask } = pageSocket();
    const askMock = vi.fn(async () => ({ ok: true, data: "[1,2,3]" }));
    bindBodies(socket, askMock);

    const answer = await ask("mock:body", { serverId: "shop", requestId: "r1", part: "response" });

    expect(askMock).toHaveBeenCalledWith({
      action: "mock:request:body",
      serverId: "shop",
      requestId: "r1",
      part: "response",
    });
    expect(answer).toEqual({ ok: true, data: "[1,2,3]" });
  });

  it("is told why for a mock Studio does not run, or a body the mock no longer keeps", async () => {
    const { socket, ask } = pageSocket();
    bindBodies(socket, (command) =>
      command.serverId === "shop"
        ? Promise.resolve({ ok: false, error: "The mock no longer keeps it." })
        : undefined,
    );

    const gone = await ask("mock:body", { serverId: "shop", requestId: "r1", part: "request" });
    const unknown = await ask("mock:body", { serverId: "nope", requestId: "r1", part: "request" });
    const unread = await ask("mock:body", { serverId: "shop", requestId: 1, part: "request" });

    expect(gone).toEqual({ ok: false, error: "The mock no longer keeps it." });
    expect(unknown).toEqual({ ok: false, error: 'No mock is named "nope".' });
    expect(unread).toEqual({ ok: false, error: "Studio could not read which body to send." });
  });

  it("is sent an app's body, which the runtime that made the request is asked for", async () => {
    const { socket, ask } = pageSocket();
    bindBodies(socket, () => undefined);
    const emitted = attachRuntime(() => [null, { ok: true, data: '{"id":1}' }]);

    const answer = await ask("request:body", {
      sessionId: "app",
      requestId: "r2",
      part: "request",
    });

    expect(emitted).toEqual([{ requestId: "r2", part: "request" }]);
    expect(answer).toEqual({ ok: true, data: '{"id":1}' });
  });

  it("is told why when the app is gone, or does not answer", async () => {
    const { socket, ask } = pageSocket();
    bindBodies(socket, () => undefined);

    const gone = await ask("request:body", { sessionId: "app", requestId: "r2", part: "response" });
    attachRuntime(() => [new Error("timeout"), undefined]);
    const silent = await ask("request:body", {
      sessionId: "app",
      requestId: "r2",
      part: "response",
    });

    expect(gone).toEqual({
      ok: false,
      error: "The app that made this request is not attached to Studio now.",
    });
    expect(silent).toEqual({ ok: false, error: "The app did not send the body." });
  });
});
