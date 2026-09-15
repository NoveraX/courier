/**
 * Tests for `createRuntimePlaygroundRouter` — the Studio-side router for the
 * rid-keyed playground wire on the `/runtime` namespace.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BindingTable } from "../src/server/catalog/binding-table";
import { clearStudioServerState, registerRuntime } from "../src/server/runtime-namespace-state";
import { createRuntimePlaygroundRouter } from "../src/server/runtime-playground-router";

interface FakeUiSocket {
  id: string;
  emit: ReturnType<typeof vi.fn>;
}

interface FakeRuntimeSocket {
  id: string;
  connected: boolean;
  emit: ReturnType<typeof vi.fn>;
}

function makeUiSocket(id: string): FakeUiSocket {
  return { id, emit: vi.fn() };
}

function makeRuntimeSocket(id: string): FakeRuntimeSocket {
  return { id, connected: true, emit: vi.fn() };
}

function makeUiNamespace(sockets: Map<string, FakeUiSocket>) {
  return {
    to(socketId: string) {
      const sock = sockets.get(socketId);
      return {
        emit(event: string, payload: unknown) {
          if (sock) (sock.emit as (e: string, p: unknown) => void)(event, payload);
        },
      };
    },
    emit(_event: string, _payload: unknown) {},
  };
}

function setupRouter(transports: string[] = ["http"], sourceNames: string[] = ["api"]) {
  const bindingTable = new BindingTable();
  // biome-ignore lint/suspicious/noExplicitAny: test convenience
  bindingTable.attachRuntime("rt-1", transports as any, sourceNames);

  const runtimeSock = makeRuntimeSocket("rt-sock-1");
  registerRuntime({
    runtimeId: "rt-1",
    kind: "server",
    // biome-ignore lint/suspicious/noExplicitAny: stub
    socket: runtimeSock as any,
    transports: transports as ("http" | "sse" | "ws")[],
    sourceNames,
  });

  const ui = makeUiSocket("ui-1");
  const uiNs = makeUiNamespace(new Map([["ui-1", ui]]));
  const router = createRuntimePlaygroundRouter({
    bindingTable,
    // biome-ignore lint/suspicious/noExplicitAny: stub
    uiNamespace: uiNs as any,
  });

  return { bindingTable, runtimeSock, ui, uiNs, router };
}

beforeEach(() => {
  clearStudioServerState();
});

afterEach(() => {
  clearStudioServerState();
});

describe("createRuntimePlaygroundRouter", () => {
  it("dispatches a valid playground:exec to the bound runtime socket", () => {
    const { runtimeSock, ui, router } = setupRouter();

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-1",
      source: "api",
      group: "users",
      method: "list",
      transport: "http",
    });

    expect(runtimeSock.emit).toHaveBeenCalledWith(
      "playground:execute",
      expect.objectContaining({ rid: "r-1", source: "api", transport: "http" }),
    );
    expect(router._inFlightSize()).toBe(1);
  });

  it("emits playground:error to UI when binding is orphan", () => {
    const bindingTable = new BindingTable();
    const ui = makeUiSocket("ui-1");
    const uiNs = makeUiNamespace(new Map([["ui-1", ui]]));
    const router = createRuntimePlaygroundRouter({
      bindingTable,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      uiNamespace: uiNs as any,
    });

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-1",
      source: "api",
      group: "users",
      method: "list",
      transport: "http",
    });

    expect(ui.emit).toHaveBeenCalledWith(
      "playground:error",
      expect.objectContaining({ rid: "r-1" }),
    );
    expect(router._inFlightSize()).toBe(0);
  });

  it("emits playground:error on binding conflict", () => {
    const bindingTable = new BindingTable();
    bindingTable.attachRuntime("rt-1", ["http"], ["api"]);
    bindingTable.attachRuntime("rt-2", ["http"], ["api"]);

    const ui = makeUiSocket("ui-1");
    const uiNs = makeUiNamespace(new Map([["ui-1", ui]]));
    const router = createRuntimePlaygroundRouter({
      bindingTable,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      uiNamespace: uiNs as any,
    });

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-1",
      source: "api",
      group: "users",
      method: "list",
      transport: "http",
    });

    expect(ui.emit).toHaveBeenCalledWith(
      "playground:error",
      expect.objectContaining({ rid: "r-1" }),
    );
  });

  it("forwardChunk routes by rid to the originating UI socket", () => {
    const { ui, router } = setupRouter(["sse"]);

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-2",
      source: "api",
      group: "feed",
      method: "stream",
      transport: "sse",
    });

    router.forwardChunk({ rid: "r-2", chunk: { kind: "sse-event", event: { data: "x" } } }, "rt-1");
    router.forwardChunk({ rid: "unknown-rid", chunk: { kind: "sse-event", event: { data: "y" } } }, "rt-1");

    expect(ui.emit).toHaveBeenCalledWith(
      "playground:chunk",
      expect.objectContaining({ rid: "r-2" }),
    );
    expect(ui.emit).not.toHaveBeenCalledWith(
      "playground:chunk",
      expect.objectContaining({ rid: "unknown-rid" }),
    );
  });

  it("clears in-flight on forwardEnd and forwardError", () => {
    const { ui, router } = setupRouter();

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-end",
      source: "api",
      group: "u",
      method: "m",
      transport: "http",
    });
    expect(router._inFlightSize()).toBe(1);
    router.forwardEnd({ rid: "r-end", summary: { durationMs: 50 } }, "rt-1");
    expect(router._inFlightSize()).toBe(0);

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-err",
      source: "api",
      group: "u",
      method: "m",
      transport: "http",
    });
    expect(router._inFlightSize()).toBe(1);
    router.forwardError({ rid: "r-err", error: { message: "boom" } }, "rt-1");
    expect(router._inFlightSize()).toBe(0);
  });

  it("synthesizes errors for in-flight rids on runtime disconnect", () => {
    const { ui, router } = setupRouter(["http", "sse"]);

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-a",
      source: "api",
      group: "u",
      method: "m",
      transport: "http",
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-b",
      source: "api",
      group: "f",
      method: "s",
      transport: "sse",
    });
    expect(router._inFlightSize()).toBe(2);

    router.onRuntimeDisconnect("rt-1");

    expect(router._inFlightSize()).toBe(0);
    const errorCalls = ui.emit.mock.calls.filter(
      (call) =>
        call[0] === "playground:error" &&
        (call[1] as { error?: { message?: string } })?.error?.message ===
          "Runtime disconnected mid-request",
    );
    expect(errorCalls.length).toBe(2);
  });

  it("cancels in-flight rids on UI disconnect by emitting playground:cancel to runtime", () => {
    const { runtimeSock, ui, router } = setupRouter();

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-1",
      source: "api",
      group: "u",
      method: "m",
      transport: "http",
    });
    router.onUiDisconnect("ui-1");

    expect(router._inFlightSize()).toBe(0);
    expect(runtimeSock.emit).toHaveBeenCalledWith("playground:cancel", { rid: "r-1" });
  });

  it("cancel forwards to runtime but does not delete inFlight (waits for terminal event)", () => {
    const { runtimeSock, ui, router } = setupRouter(["sse"]);

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-cancel",
      source: "api",
      group: "f",
      method: "s",
      transport: "sse",
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.cancel(ui as any, { rid: "r-cancel" });

    expect(runtimeSock.emit).toHaveBeenCalledWith("playground:cancel", { rid: "r-cancel" });
    expect(router._inFlightSize()).toBe(1);

    router.forwardEnd({ rid: "r-cancel", summary: { durationMs: 10 } }, "rt-1");
    expect(router._inFlightSize()).toBe(0);
  });

  it("rejects malformed playground:exec payloads silently", () => {
    const bindingTable = new BindingTable();
    const ui = makeUiSocket("ui-1");
    const uiNs = makeUiNamespace(new Map([["ui-1", ui]]));
    const router = createRuntimePlaygroundRouter({
      bindingTable,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      uiNamespace: uiNs as any,
    });

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, null);
    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, { rid: "r-1" });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-1",
      source: "api",
      group: "g",
      method: "m",
      transport: "telnet",
    });

    expect(ui.emit).not.toHaveBeenCalled();
    expect(router._inFlightSize()).toBe(0);
  });

  it("ignores cross-socket cancel attempts", () => {
    const { runtimeSock, ui, uiNs, router, bindingTable } = setupRouter();
    void uiNs;
    void bindingTable;

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-x",
      source: "api",
      group: "u",
      method: "m",
      transport: "http",
    });
    const ui2 = makeUiSocket("ui-2");
    // ui-2 tries to cancel ui-1's request — should be a no-op
    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.cancel(ui2 as any, { rid: "r-x" });

    expect(runtimeSock.emit).not.toHaveBeenCalledWith(
      "playground:cancel",
      expect.objectContaining({ rid: "r-x" }),
    );
    expect(router._inFlightSize()).toBe(1);
  });

  it("write forwards a valid message to the owning runtime for a WS rid", () => {
    const { runtimeSock, ui, router } = setupRouter(["ws"], ["chat"]);

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-ws",
      source: "chat",
      group: "room",
      method: "join",
      transport: "ws",
    });

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.write(ui as any, { rid: "r-ws", data: { type: "message", body: "hi" } });

    expect(runtimeSock.emit).toHaveBeenCalledWith("playground:write", {
      rid: "r-ws",
      data: { type: "message", body: "hi" },
    });
  });

  it("write is a silent no-op for a non-WS rid", () => {
    const { runtimeSock, ui, router } = setupRouter();

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-http",
      source: "api",
      group: "u",
      method: "m",
      transport: "http",
    });
    runtimeSock.emit.mockClear();

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.write(ui as any, { rid: "r-http", data: { any: "payload" } });

    expect(runtimeSock.emit).not.toHaveBeenCalledWith("playground:write", expect.anything());
  });

  it("write rejects cross-socket attempts", () => {
    const { runtimeSock, ui, router } = setupRouter(["ws"], ["chat"]);

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-ws",
      source: "chat",
      group: "room",
      method: "join",
      transport: "ws",
    });
    runtimeSock.emit.mockClear();

    const ui2 = makeUiSocket("ui-2");
    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.write(ui2 as any, { rid: "r-ws", data: { body: "hijack" } });

    expect(runtimeSock.emit).not.toHaveBeenCalled();
  });

  it("write rejects a malformed payload", () => {
    const bindingTable = new BindingTable();
    const ui = makeUiSocket("ui-1");
    const uiNs = makeUiNamespace(new Map([["ui-1", ui]]));
    const router = createRuntimePlaygroundRouter({
      bindingTable,
      // biome-ignore lint/suspicious/noExplicitAny: stub
      uiNamespace: uiNs as any,
    });

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.write(ui as any, null);
    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.write(ui as any, { rid: "", data: 1 });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.write(ui as any, { rid: "r", __proto__: { polluted: true } });

    expect(ui.emit).not.toHaveBeenCalled();
  });

  // ── Trust boundary tests ──

  it("forwardChunk drops chunks from a non-owning runtime (ownership check)", () => {
    const { ui, router } = setupRouter(["sse"]);

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-own",
      source: "api",
      group: "feed",
      method: "stream",
      transport: "sse",
    });
    ui.emit.mockClear();

    router.forwardChunk(
      { rid: "r-own", chunk: { kind: "sse-event", event: { data: "x" } } },
      "rt-WRONG",
    );

    expect(ui.emit).not.toHaveBeenCalled();
  });

  it("forwardEnd drops end from a non-owning runtime (ownership check)", () => {
    const { ui, router } = setupRouter();

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-own",
      source: "api",
      group: "u",
      method: "m",
      transport: "http",
    });
    ui.emit.mockClear();

    router.forwardEnd({ rid: "r-own", summary: { durationMs: 50 } }, "rt-WRONG");

    expect(ui.emit).not.toHaveBeenCalled();
    expect(router._inFlightSize()).toBe(1);
  });

  it("forwardError drops error from a non-owning runtime (ownership check)", () => {
    const { ui, router } = setupRouter();

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-own",
      source: "api",
      group: "u",
      method: "m",
      transport: "http",
    });
    ui.emit.mockClear();

    router.forwardError({ rid: "r-own", error: { message: "fake" } }, "rt-WRONG");

    expect(ui.emit).not.toHaveBeenCalled();
    expect(router._inFlightSize()).toBe(1);
  });

  it("forwardChunk drops malformed chunks (no valid kind)", () => {
    const { ui, router } = setupRouter(["http"]);

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-bad",
      source: "api",
      group: "u",
      method: "m",
      transport: "http",
    });
    ui.emit.mockClear();

    router.forwardChunk({ rid: "r-bad", chunk: { kind: "unknown-kind" } }, "rt-1");
    router.forwardChunk({ rid: "r-bad", chunk: null }, "rt-1");
    router.forwardChunk({ rid: "r-bad" }, "rt-1");

    expect(ui.emit).not.toHaveBeenCalledWith("playground:chunk", expect.anything());
  });

  it("dispatch emits error to UI when runtime socket is disconnected", () => {
    const { runtimeSock, ui, router } = setupRouter();
    runtimeSock.connected = false;

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-disc",
      source: "api",
      group: "u",
      method: "m",
      transport: "http",
    });

    expect(ui.emit).toHaveBeenCalledWith(
      "playground:error",
      expect.objectContaining({
        rid: "r-disc",
        error: expect.objectContaining({ message: expect.stringContaining("not reachable") }),
      }),
    );
    expect(router._inFlightSize()).toBe(0);
  });

  it("onUiDisconnect continues cleanup when one emit fails", () => {
    const { runtimeSock, ui, router } = setupRouter(["http", "sse"]);

    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-a",
      source: "api",
      group: "u",
      method: "m",
      transport: "http",
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    router.dispatch(ui as any, {
      rid: "r-b",
      source: "api",
      group: "f",
      method: "s",
      transport: "sse",
    });
    expect(router._inFlightSize()).toBe(2);

    // Make emit throw on the FIRST cancel attempt during disconnect
    let cancelCallCount = 0;
    runtimeSock.emit = vi.fn(() => {
      cancelCallCount++;
      if (cancelCallCount === 1) throw new Error("emit fail");
    });

    router.onUiDisconnect("ui-1");

    // Both entries cleaned up despite emit failure on first
    expect(router._inFlightSize()).toBe(0);
  });
});
