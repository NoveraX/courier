/**
 * How a Courier server stops: its streams and its WebSocket connections
 * drained side by side, each within its deadline, what did not close in
 * time ended, and the HTTP server closed only after them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createShutdown, type ShutdownParts } from "../src/shutdown";

// Mock createLogger to avoid side effects
vi.mock("@noverax/courier/server", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

/** What a test hands createShutdown, in the shape a running server has. */
function parts(overrides: Partial<Record<keyof ShutdownParts, unknown>> = {}) {
  const order: string[] = [];
  const httpServer = {
    close: vi.fn((done: (error?: Error) => void) => {
      order.push("http closed");
      done();
    }),
  };
  const ws = {
    destroy: vi.fn(async () => {
      order.push("ws drained");
    }),
  };
  const detachWebSockets = vi.fn(() => {
    order.push("ws detached");
  });
  const given = {
    httpServer,
    ws,
    detachWebSockets,
    getSSE: () => undefined,
    /* A server that came up; stop closes only one that did. */
    ready: Promise.resolve("http://localhost:3001"),
    ...overrides,
  };
  return { given: given as unknown as ShutdownParts, httpServer, ws, order };
}

describe("createShutdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drains the WebSocket handler within 5 seconds, ends what it left open, then closes the HTTP server", async () => {
    const { given, ws, order } = parts();

    await createShutdown(given)();

    expect(ws.destroy).toHaveBeenCalledWith({ timeoutMs: 5_000 });
    expect(order).toEqual(["ws drained", "ws detached", "http closed"]);
  });

  it("drains SSE connections beside the WebSocket ones", async () => {
    const sse = { sseConnections: { count: 0 }, shutdownSSE: vi.fn().mockResolvedValue(undefined) };
    const { given } = parts({ getSSE: () => sse });

    await createShutdown(given)();

    expect(sse.shutdownSSE).toHaveBeenCalledWith({ retryMs: 3000, drainMs: 2000 });
  });

  it("is idempotent — second call is a no-op", async () => {
    const { given, httpServer, ws } = parts();
    const stop = createShutdown(given);

    await stop();
    await stop();

    expect(httpServer.close).toHaveBeenCalledOnce();
    expect(ws.destroy).toHaveBeenCalledOnce();
  });

  it("closes no HTTP server that never listened", async () => {
    const failed = Promise.reject(new Error("Port 3001 is already in use"));
    failed.catch(() => undefined);
    const { given, httpServer } = parts({ ready: failed });

    await createShutdown(given)();

    expect(httpServer.close).not.toHaveBeenCalled();
  });
});
