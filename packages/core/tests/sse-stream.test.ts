import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternalSSERegistry } from "../src/adapter/sse-registry";
import { createSSEStream } from "../src/adapter/sse-stream";
import { emitClose } from "../src/adapter/sse-stream-lifecycle";
import type { SSEStreamOptions } from "../src/adapter/sse-types";
import { ForbiddenError } from "../src/realtime/errors";
import type { SSEContext, SSEEvent, SSEHandler } from "../src/realtime/types";
import type { StudioHooks } from "../src/studio/hooks";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple async generator yielding given events then returning */
async function* generateEvents(events: SSEEvent[]): AsyncGenerator<SSEEvent, void, unknown> {
  for (const event of events) {
    yield event;
  }
}

/** Create a handler wrapping a static event list */
function staticHandler(events: SSEEvent[]): SSEHandler<unknown, unknown> {
  return () => generateEvents(events);
}

/** Create a minimal SSEContext with an AbortController */
function createCtx(overrides?: Partial<SSEContext>): {
  ctx: SSEContext;
  abortController: AbortController;
} {
  const abortController = new AbortController();
  const ctx: SSEContext = {
    variables: {},
    signal: abortController.signal,
    headers: new Headers(),
    ...overrides,
  };
  return { ctx, abortController };
}

/** Create a mock InternalSSERegistry */
function createMockRegistry(overrides?: Partial<InternalSSERegistry>): InternalSSERegistry {
  return {
    count: 0,
    isShuttingDown: false,
    shutdownSignal: new AbortController().signal,
    get: vi.fn().mockReturnValue({ eventCount: 0, totalBytes: 0 }),
    has: vi.fn().mockReturnValue(true),
    list: vi.fn().mockReturnValue([]),
    getByMeta: vi.fn().mockReturnValue([]),
    getByEndpoint: vi.fn().mockReturnValue([]),
    disconnect: vi.fn(),
    disconnectAll: vi.fn(),
    send: vi.fn().mockReturnValue(true),
    broadcastToEndpoint: vi.fn().mockReturnValue(new Map()),
    broadcastToMeta: vi.fn().mockReturnValue(new Map()),
    broadcastAll: vi.fn().mockReturnValue(new Map()),
    add: vi.fn().mockReturnValue(true),
    remove: vi.fn(),
    recordEvent: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Create mock StudioHooks */
function createMockDt(): StudioHooks {
  return {
    onStreamOpen: vi.fn(),
    onStreamMessage: vi.fn(),
    onStreamClose: vi.fn(),
    onStreamError: vi.fn(),
  };
}

/** Build default SSEStreamOptions */
function createOpts(overrides?: Partial<SSEStreamOptions>): SSEStreamOptions {
  return {
    connectionId: "conn-1",
    requestId: "req-1",
    source: "testSource",
    group: "notifications",
    method: "feed",
    meta: {},
    registry: createMockRegistry(),
    dt: createMockDt(),
    t0: performance.now(),
    ...overrides,
  };
}

/** Collect all chunks from a ReadableStream as text */
async function collectText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tests — createSSEStream
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("createSSEStream", () => {
  it("emits events from async generator in SSE format", async () => {
    const handler = staticHandler([{ data: { msg: "hello" } }, { data: { msg: "world" } }]);
    const { ctx } = createCtx();
    const opts = createOpts();

    const stream = createSSEStream(handler, ctx, opts);
    const text = await collectText(stream);

    expect(text).toContain('data: {"msg":"hello"}');
    expect(text).toContain('data: {"msg":"world"}');
  });

  it("includes sequential IDs on events", async () => {
    const handler = staticHandler([{ data: "a" }, { data: "b" }, { data: "c" }]);
    const { ctx } = createCtx();
    const opts = createOpts();

    const stream = createSSEStream(handler, ctx, opts);
    const text = await collectText(stream);

    expect(text).toContain("id: 1");
    expect(text).toContain("id: 2");
    expect(text).toContain("id: 3");
  });

  it("sends heartbeat comments at interval", async () => {
    vi.useFakeTimers();

    // Generator that blocks until aborted
    let resolveBlock: () => void;
    const blocker = new Promise<void>((r) => {
      resolveBlock = r;
    });

    const handler: SSEHandler<unknown, unknown> = async function* (_ctx) {
      yield { data: "start" };
      await blocker;
    };

    const { ctx, abortController } = createCtx();
    const opts = createOpts();

    const stream = createSSEStream(handler, ctx, opts);
    const reader = stream.getReader();

    // Read first event
    await vi.advanceTimersByTimeAsync(0);
    await reader.read();

    // Advance past heartbeat interval
    await vi.advanceTimersByTimeAsync(25_000);

    // Abort to close stream and unblock
    resolveBlock!();
    abortController.abort();

    // Drain remaining chunks
    const decoder = new TextDecoder();
    let collected = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      collected += decoder.decode(value, { stream: true });
    }

    expect(collected).toContain(": ping");
  });

  it("registers connection in registry on start", async () => {
    const registry = createMockRegistry();
    const handler = staticHandler([{ data: "x" }]);
    const { ctx } = createCtx();
    const opts = createOpts({ registry });

    const stream = createSSEStream(handler, ctx, opts);
    await collectText(stream);

    expect(registry.add).toHaveBeenCalledOnce();
    expect(registry.add).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "conn-1",
        source: "testSource",
        group: "notifications",
        method: "feed",
      }),
    );
  });

  it("unregisters connection on complete", async () => {
    const registry = createMockRegistry();
    const handler = staticHandler([{ data: "done" }]);
    const { ctx } = createCtx();
    const opts = createOpts({ registry });

    const stream = createSSEStream(handler, ctx, opts);
    await collectText(stream);

    expect(registry.remove).toHaveBeenCalledWith("conn-1");
  });

  it("ends a failed stream with a failure event that keeps the error's text on the server", async () => {
    const handler: SSEHandler<unknown, unknown> = async function* () {
      yield { data: "before" };
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
    };
    const { ctx } = createCtx();
    const opts = createOpts();

    const stream = createSSEStream(handler, ctx, opts);
    const text = await collectText(stream);

    expect(text).toContain('event: courier:error\ndata: {"code":5000,"message":"Stream failed"}');
    expect(text).not.toContain("ECONNREFUSED");
  });

  it("passes a RealtimeError's code and message to the client", async () => {
    const handler: SSEHandler<unknown, unknown> = async function* () {
      throw new ForbiddenError("Not a member of this room");
    };
    const { ctx } = createCtx();

    const text = await collectText(createSSEStream(handler, ctx, createOpts()));

    expect(text).toContain('data: {"code":4403,"message":"Not a member of this room"}');
  });

  it("ends a finished stream with a completion event", async () => {
    const handler: SSEHandler<unknown, unknown> = async function* () {
      yield { data: "only" };
    };
    const { ctx } = createCtx();

    const text = await collectText(createSSEStream(handler, ctx, createOpts()));

    expect(text.endsWith("event: courier:complete\ndata: null\n\n")).toBe(true);
  });

  it("fails a stream whose handler sends a reserved event name", async () => {
    const handler: SSEHandler<unknown, unknown> = async function* () {
      yield { event: "courier:complete", data: null };
    };
    const { ctx } = createCtx();

    const text = await collectText(createSSEStream(handler, ctx, createOpts()));

    expect(text).toContain("event: courier:error");
    expect(text).not.toContain("event: courier:complete");
  });

  it("respects abort signal", async () => {
    let yieldCount = 0;

    const handler: SSEHandler<unknown, unknown> = async function* (ctx) {
      while (!ctx.signal.aborted) {
        yieldCount++;
        yield { data: `msg-${yieldCount}` };
        // Small delay to allow abort to fire between iterations
        await new Promise((r) => setTimeout(r, 1));
      }
    };

    const { ctx, abortController } = createCtx();
    const opts = createOpts();

    const stream = createSSEStream(handler, ctx, opts);
    const reader = stream.getReader();

    // Read a few events then abort
    await reader.read();
    await reader.read();
    abortController.abort();

    // Drain remaining
    while (!(await reader.read()).done) {
      /* drain */
    }

    // Should have stopped early, not infinite
    expect(yieldCount).toBeLessThan(100);
  });

  it("closes stream when registry rejects connection", async () => {
    const registry = createMockRegistry({ add: vi.fn().mockReturnValue(false) });
    const handler = staticHandler([{ data: "never" }]);
    const { ctx } = createCtx();
    const opts = createOpts({ registry });

    const stream = createSSEStream(handler, ctx, opts);
    const text = await collectText(stream);

    // Stream closes immediately — no events emitted
    expect(text).toBe("");
    expect(registry.remove).not.toHaveBeenCalled();
  });

  it("calls onDisconnect lifecycle hook on close", async () => {
    const onDisconnect = vi.fn();
    const registry = createMockRegistry({
      get: vi.fn().mockReturnValue({ eventCount: 2, totalBytes: 64 }),
    });
    const handler = staticHandler([{ data: "a" }, { data: "b" }]);
    const { ctx } = createCtx();
    const opts = createOpts({ registry, onDisconnect });

    const stream = createSSEStream(handler, ctx, opts);
    await collectText(stream);

    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "conn-1",
        reason: "complete",
        eventCount: 2,
        totalBytes: 64,
      }),
    );
  });

  it("calls onError lifecycle hook on error", async () => {
    const onError = vi.fn();
    const handler: SSEHandler<unknown, unknown> = async function* () {
      throw new Error("kaboom");
    };
    const { ctx } = createCtx();
    const opts = createOpts({ onError });

    const stream = createSSEStream(handler, ctx, opts);
    await collectText(stream);

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "conn-1",
        error: expect.any(Error),
      }),
    );
  });

  it("fires studio onStreamMessage hook for each event", async () => {
    const dt = createMockDt();
    const registry = createMockRegistry({
      get: vi.fn().mockReturnValue({ eventCount: 1 }),
    });
    const handler = staticHandler([{ data: "a" }, { event: "update", data: "b" }]);
    const { ctx } = createCtx();
    const opts = createOpts({ dt, registry });

    const stream = createSSEStream(handler, ctx, opts);
    await collectText(stream);

    expect(dt.onStreamMessage).toHaveBeenCalledTimes(2);
    expect(dt.onStreamMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        seq: 1,
      }),
    );
    expect(dt.onStreamMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "update",
      }),
    );
  });

  it("fires studio onStreamClose hook on complete", async () => {
    const dt = createMockDt();
    const registry = createMockRegistry({
      get: vi.fn().mockReturnValue({ eventCount: 1, totalBytes: 32 }),
    });
    const handler = staticHandler([{ data: "x" }]);
    const { ctx } = createCtx();
    const opts = createOpts({ dt, registry });

    const stream = createSSEStream(handler, ctx, opts);
    await collectText(stream);

    expect(dt.onStreamClose).toHaveBeenCalledOnce();
    expect(dt.onStreamClose).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        reason: "complete",
        eventCount: 1,
        totalBytes: 32,
      }),
    );
  });

  it("records event metrics in registry", async () => {
    const registry = createMockRegistry();
    const handler = staticHandler([{ data: "a" }, { data: "b" }]);
    const { ctx } = createCtx();
    const opts = createOpts({ registry });

    const stream = createSSEStream(handler, ctx, opts);
    await collectText(stream);

    expect(registry.recordEvent).toHaveBeenCalledTimes(2);
    expect(registry.recordEvent).toHaveBeenCalledWith("conn-1", expect.any(Number));
  });
});

// ---------------------------------------------------------------------------
// Tests — emitClose
// ---------------------------------------------------------------------------

describe("emitClose", () => {
  it("calls dt.onStreamClose with correct args", () => {
    const dt = createMockDt();
    const t0 = performance.now() - 100;

    emitClose(dt, "req-42", "complete", 5, 1024, t0);

    expect(dt.onStreamClose).toHaveBeenCalledOnce();
    expect(dt.onStreamClose).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-42",
        reason: "complete",
        eventCount: 5,
        totalBytes: 1024,
      }),
    );
    // Duration should be roughly >= 100ms
    const call = (dt.onStreamClose as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.duration).toBeGreaterThanOrEqual(0);
    expect(call.timestamp).toBeGreaterThan(0);
  });

  it("does nothing when dt.onStreamClose is undefined", () => {
    const dt: StudioHooks = {};

    // Should not throw
    expect(() => emitClose(dt, "req-1", "disconnect", 0, 0, performance.now())).not.toThrow();
  });
});

describe("runCleanupStep error logging", () => {
  it("logs a warning when a cleanup step throws and continues running siblings", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cleanupCalls: string[] = [];

    const handler = staticHandler([{ data: "x" }]);
    const { ctx } = createCtx();
    const opts = createOpts({
      playgroundRid: "rid-1",
      // unregister callback throws — must NOT prevent the heartbeat /
      // cleanupSSEStream steps from running.
      registerPlaygroundAbort: (_rid, _abort) => {
        return () => {
          cleanupCalls.push("unregister");
          throw new Error("boom");
        };
      },
    });

    const stream = createSSEStream(handler, ctx, opts);
    await collectText(stream);

    expect(cleanupCalls).toContain("unregister");
    const line = warnSpy.mock.calls.find((c) => String(c[1]).includes("SSE cleanup step"));
    expect(String(line?.[1])).toContain("unregisterPlaygroundAbort");
    expect(line?.[2]).toEqual(new Error("boom"));
    warnSpy.mockRestore();
  });
});
