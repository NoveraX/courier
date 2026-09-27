import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShutdown } from "../src/shutdown";

// Mock createLogger to avoid side effects
vi.mock("@noverax/courier", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// --- Mock factories ---

function createMockHttpServer() {
  return {
    close: vi.fn((cb: (err?: Error) => void) => cb()),
  };
}

function createMockWss(clientCount = 0) {
  const clients = new Set<{ close: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> }>();
  for (let i = 0; i < clientCount; i++) {
    clients.add({ close: vi.fn(), terminate: vi.fn() });
  }
  return { clients };
}

function createMockSSE() {
  return {
    sseConnections: { count: 0 },
    shutdownSSE: vi.fn().mockResolvedValue(undefined),
  };
}

// --- createShutdown ---

/** A server that came up; `stop` closes only one that did. */
const LISTENING = Promise.resolve("http://localhost:3001");

describe("createShutdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a stop function", () => {
    const httpServer = createMockHttpServer();
    const stop = createShutdown(
      httpServer as any,
      () => undefined,
      () => undefined,
      LISTENING,
    );

    expect(typeof stop).toBe("function");
  });

  it("closes HTTP server on stop", async () => {
    const httpServer = createMockHttpServer();
    const stop = createShutdown(
      httpServer as any,
      () => undefined,
      () => undefined,
      LISTENING,
    );

    await stop();

    expect(httpServer.close).toHaveBeenCalledOnce();
  });

  it("drains SSE connections on stop", async () => {
    const httpServer = createMockHttpServer();
    const sse = createMockSSE();
    const stop = createShutdown(
      httpServer as any,
      () => undefined,
      () => sse as any,
      LISTENING,
    );

    await stop();

    expect(sse.shutdownSSE).toHaveBeenCalledWith({ retryMs: 3000, drainMs: 2000 });
  });

  it("closes WebSocket clients on stop", async () => {
    const httpServer = createMockHttpServer();
    const wss = createMockWss(2);
    const stop = createShutdown(
      httpServer as any,
      () => wss as any,
      () => undefined,
      LISTENING,
    );

    const stopPromise = stop();
    // Advance timers to resolve the drain timeout
    await vi.advanceTimersByTimeAsync(6000);
    await stopPromise;

    const clients = [...wss.clients];
    expect(clients[0]!.close).toHaveBeenCalledWith(1012, "Server shutting down");
    expect(clients[1]!.close).toHaveBeenCalledWith(1012, "Server shutting down");
  });

  it("terminates remaining WS clients after timeout", async () => {
    const httpServer = createMockHttpServer();
    const wss = createMockWss(1);
    const stop = createShutdown(
      httpServer as any,
      () => wss as any,
      () => undefined,
      LISTENING,
    );

    const stopPromise = stop();
    // Client doesn't close itself, so terminate is called after timeout
    await vi.advanceTimersByTimeAsync(6000);
    await stopPromise;

    const client = [...wss.clients][0]!;
    expect(client.terminate).toHaveBeenCalledOnce();
  });

  it("is idempotent — second call is a no-op", async () => {
    const httpServer = createMockHttpServer();
    const stop = createShutdown(
      httpServer as any,
      () => undefined,
      () => undefined,
      LISTENING,
    );

    await stop();
    await stop();

    expect(httpServer.close).toHaveBeenCalledOnce();
  });

  it("skips SSE drain when no SSE configured", async () => {
    const httpServer = createMockHttpServer();
    const stop = createShutdown(
      httpServer as any,
      () => undefined,
      () => undefined,
      LISTENING,
    );

    // Should not throw
    await stop();
    expect(httpServer.close).toHaveBeenCalledOnce();
  });

  it("skips WS drain when no WS configured", async () => {
    const httpServer = createMockHttpServer();
    const stop = createShutdown(
      httpServer as any,
      () => undefined,
      () => undefined,
      LISTENING,
    );

    await stop();
    expect(httpServer.close).toHaveBeenCalledOnce();
  });
});
