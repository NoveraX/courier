/**
 * Routing-level tests for `handlePlayground` (HTTP execute) and
 * `handleWSSend` (WS message broadcast). The two handlers exist to do
 * exactly two jobs:
 *
 *  1. **Pick the right app socket** when the UI fires a request.
 *  2. **Surface a useful error** when nobody can answer.
 *
 * The tests below stub `AppNamespace` / `AppSocket` end-to-end so we can
 * assert which socket received the emit and what callback the UI saw —
 * neither handler should ever silently swallow a routing failure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handlePlayground } from "../src/server/ui-playground-handler";
import { handleWSSend } from "../src/server/ui-ws-send-handler";
import type { AppNamespace, AppSocket, AppSocketData } from "../src/server/socket-data";

interface StubSocket extends AppSocket {
  __emitCalls: Array<{ event: string; payload: unknown }>;
}

function makeSocket(
  id: string,
  data: AppSocketData,
  emitImpl?: (
    event: string,
    payload: unknown,
    ack: (result: Record<string, unknown>) => void,
  ) => void,
): StubSocket {
  const calls: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    id,
    data,
    emit: (
      event: string,
      payload: unknown,
      ack: (result: Record<string, unknown>) => void,
    ) => {
      calls.push({ event, payload });
      emitImpl?.(event, payload, ack);
      return true;
    },
    __emitCalls: calls,
  };
  return socket as unknown as StubSocket;
}

function makeNamespace(sockets: StubSocket[]): AppNamespace {
  const map = new Map<string, AppSocket>();
  for (const s of sockets) map.set(s.id, s);
  return { sockets: map } as unknown as AppNamespace;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// handlePlayground
// ---------------------------------------------------------------------------

describe("handlePlayground", () => {
  const basePayload = {
    source: "api",
    group: "users",
    method: "getAll",
    variables: {},
    headers: {},
  } as const;

  it("rejects with friendly error when no apps are connected", () => {
    const cb = vi.fn();
    handlePlayground(makeNamespace([]))(
      { ...basePayload, mode: "direct" },
      cb,
    );
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringMatching(/No application connected/),
        status: 0,
      }),
    );
  });

  it("direct mode picks the server-framework socket", () => {
    const browser = makeSocket("b", { sessionId: "b", framework: "unknown" }, (_e, _p, ack) =>
      ack({ status: 200 }),
    );
    const server = makeSocket("s", { sessionId: "s", framework: "next" }, (_e, _p, ack) =>
      ack({ status: 200 }),
    );

    const cb = vi.fn();
    handlePlayground(makeNamespace([browser, server]))(
      { ...basePayload, mode: "direct" },
      cb,
    );

    expect(server.__emitCalls).toHaveLength(1);
    expect(browser.__emitCalls).toHaveLength(0);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it("proxy mode picks the latest browser socket", () => {
    const server = makeSocket("s", { sessionId: "s", framework: "next" }, (_e, _p, ack) =>
      ack({ status: 200 }),
    );
    const browser = makeSocket("b", { sessionId: "b", framework: "unknown" }, (_e, _p, ack) =>
      ack({ status: 200 }),
    );

    const cb = vi.fn();
    handlePlayground(makeNamespace([server, browser]))(
      { ...basePayload, mode: "proxy" },
      cb,
    );

    expect(browser.__emitCalls).toHaveLength(1);
    expect(server.__emitCalls).toHaveLength(0);
  });

  it("sticky sessionId override wins over mode preference", () => {
    const server = makeSocket("s", { sessionId: "s", framework: "next" }, (_e, _p, ack) =>
      ack({ status: 200 }),
    );
    const browser = makeSocket("b", { sessionId: "b", framework: "unknown" }, (_e, _p, ack) =>
      ack({ status: 200 }),
    );

    const cb = vi.fn();
    handlePlayground(makeNamespace([server, browser]))(
      { ...basePayload, sessionId: "b", mode: "direct" },
      cb,
    );

    expect(browser.__emitCalls).toHaveLength(1);
    expect(server.__emitCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// handleWSSend
// ---------------------------------------------------------------------------

describe("handleWSSend", () => {
  const payload = { requestId: "r1", topic: "chat", data: { hi: 1 } };

  it("rejects with friendly error when no apps are connected", async () => {
    const cb = vi.fn();
    handleWSSend(makeNamespace([]))(payload, cb);
    await vi.runAllTimersAsync();
    expect(cb).toHaveBeenCalledWith({ ok: false, error: "No application connected" });
  });

  it("broadcasts to all sockets and returns ok when one owns the requestId", async () => {
    const a = makeSocket("a", { sessionId: "a", framework: "next" }, (_e, _p, ack) =>
      ack({ ok: false, error: "No active connection for requestId: r1" }),
    );
    const b = makeSocket("b", { sessionId: "b", framework: "unknown" }, (_e, _p, ack) =>
      ack({ ok: true }),
    );

    const cb = vi.fn();
    handleWSSend(makeNamespace([a, b]))(payload, cb);
    await vi.runAllTimersAsync();

    expect(a.__emitCalls).toHaveLength(1);
    expect(b.__emitCalls).toHaveLength(1);
    expect(cb).toHaveBeenCalledWith({ ok: true });
  });

  it("aggregates errors and prefers 'Not subscribed' over generic", async () => {
    const a = makeSocket("a", { sessionId: "a", framework: "next" }, (_e, _p, ack) =>
      ack({ ok: false, error: "No active connection for requestId: r1" }),
    );
    const b = makeSocket("b", { sessionId: "b", framework: "unknown" }, (_e, _p, ack) =>
      ack({ ok: false, error: "Not subscribed to topic: chat" }),
    );

    const cb = vi.fn();
    handleWSSend(makeNamespace([a, b]))(payload, cb);
    await vi.runAllTimersAsync();

    expect(cb).toHaveBeenCalledWith({ ok: false, error: "Not subscribed to topic: chat" });
  });
});
