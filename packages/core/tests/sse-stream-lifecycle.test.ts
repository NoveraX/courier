import { getEventListeners } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { createSSESender } from "../src/adapter/sse-sender";
import { cleanupSSEStream, waitForRoom } from "../src/adapter/sse-stream-lifecycle";
import type { SSEStreamOptions } from "../src/adapter/sse-types";
import type { InternalSSERegistry } from "../src/adapter/sse-registry";
import type { SSEConnectionInfo } from "../src/adapter/sse-types";
import type { StudioHooks } from "../src/studio/hooks";

function makeInfo(overrides?: Partial<SSEConnectionInfo>): SSEConnectionInfo {
  return {
    connectionId: "conn-1",
    connectedAt: 0,
    meta: {},
    source: "api",
    group: "feed",
    method: "stream",
    eventCount: 7,
    totalBytes: 256,
    lastEventAt: 0,
    ...overrides,
  };
}

function createOpts(overrides?: {
  registry?: Partial<InternalSSERegistry>;
  dt?: Partial<StudioHooks>;
  onDisconnect?: SSEStreamOptions["onDisconnect"];
}): SSEStreamOptions {
  const registry: InternalSSERegistry = {
    count: 1,
    isShuttingDown: false,
    shutdownSignal: new AbortController().signal,
    get: vi.fn().mockReturnValue(makeInfo()),
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
    ...overrides?.registry,
  };
  const dt: StudioHooks = {
    onStreamOpen: vi.fn(),
    onStreamMessage: vi.fn(),
    onStreamClose: vi.fn(),
    onStreamError: vi.fn(),
    ...overrides?.dt,
  };
  return {
    connectionId: "conn-1",
    requestId: "req-1",
    source: "api",
    group: "feed",
    method: "stream",
    meta: {},
    registry,
    dt,
    t0: performance.now(),
    onDisconnect: overrides?.onDisconnect,
  };
}

describe("cleanupSSEStream", () => {
  it("fires onStreamClose and onDisconnect exactly once on a single call", () => {
    const onDisconnect = vi.fn();
    const opts = createOpts({ onDisconnect });

    cleanupSSEStream(undefined, opts, "complete", true);

    expect(opts.dt.onStreamClose).toHaveBeenCalledTimes(1);
    expect(opts.dt.onStreamClose).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        reason: "complete",
        eventCount: 7,
        totalBytes: 256,
      }),
    );
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(opts.registry.remove).toHaveBeenCalledWith("conn-1");
  });

  it("does not fire hooks twice when called twice with registered=true (start/cancel race)", () => {
    const onDisconnect = vi.fn();
    // First call removes the entry; second call must observe the missing
    // entry and skip hook firing entirely. We simulate the registry behaviour
    // by switching `get` to return undefined after the first call.
    let removed = false;
    const get = vi.fn(() => (removed ? undefined : makeInfo()));
    const remove = vi.fn(() => {
      removed = true;
    });
    const opts = createOpts({ registry: { get, remove }, onDisconnect });

    cleanupSSEStream(undefined, opts, "complete", true);
    cleanupSSEStream(undefined, opts, "complete", true);

    expect(opts.dt.onStreamClose).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("skips hook firing entirely when registered=false", () => {
    const onDisconnect = vi.fn();
    const opts = createOpts({ onDisconnect });

    cleanupSSEStream(undefined, opts, "complete", false);

    expect(opts.dt.onStreamClose).not.toHaveBeenCalled();
    expect(onDisconnect).not.toHaveBeenCalled();
    expect(opts.registry.remove).not.toHaveBeenCalled();
  });

  it("flushes the controller even when the registry entry is already gone", () => {
    const opts = createOpts({ registry: { get: vi.fn().mockReturnValue(undefined) } });
    const close = vi.fn();
    const controller = { close } as unknown as ReadableStreamDefaultController<Uint8Array>;

    cleanupSSEStream(controller, opts, "disconnect", true);

    // Hooks skipped (info undefined), but controller close still called.
    expect(opts.dt.onStreamClose).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("swallows controller.close() throws", () => {
    const opts = createOpts({ registry: { get: vi.fn().mockReturnValue(undefined) } });
    const controller = {
      close: () => {
        throw new Error("already closed");
      },
    } as unknown as ReadableStreamDefaultController<Uint8Array>;

    expect(() => cleanupSSEStream(controller, opts, "complete", true)).not.toThrow();
  });

  it("upgrades reason='disconnect' to 'shutdown' when registry is shutting down", () => {
    const onDisconnect = vi.fn();
    const opts = createOpts({
      registry: { isShuttingDown: true },
      onDisconnect,
    });

    cleanupSSEStream(undefined, opts, "disconnect", true);

    expect(opts.dt.onStreamClose).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "shutdown" }),
    );
    expect(onDisconnect).toHaveBeenCalledWith(expect.objectContaining({ reason: "shutdown" }));
  });
});

describe("waitForRoom", () => {
  /** A stream whose one-byte buffer is already over full, and its writer. */
  function fullStream() {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>(
      {
        start(c) {
          controller = c;
        },
      },
      new ByteLengthQueuingStrategy({ highWaterMark: 1 }) as QueuingStrategy<Uint8Array>,
    );
    if (!controller) throw new Error("The stream did not start");
    const sender = createSSESender(controller, () => {});
    sender.send({ data: "an event larger than the buffer" });
    return { reader: stream.getReader(), sender };
  }

  it("keeps at most one abort listener while the client does not read", async () => {
    const { reader, sender } = fullStream();
    const abort = new AbortController();

    const waiting = waitForRoom(sender, abort.signal);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(sender.hasRoom).toBe(false);
    expect(getEventListeners(abort.signal, "abort").length).toBeLessThanOrEqual(1);
    await reader.read();
    await waiting;
    expect(getEventListeners(abort.signal, "abort")).toHaveLength(0);
  });

  it("returns as soon as the stream is aborted", async () => {
    const { sender } = fullStream();
    const abort = new AbortController();

    const waiting = waitForRoom(sender, abort.signal);
    abort.abort();

    await expect(waiting).resolves.toBeUndefined();
  });
});
