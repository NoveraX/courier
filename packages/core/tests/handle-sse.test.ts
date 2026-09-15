import { afterEach, describe, expect, it, vi } from "vitest";
import { createHandler } from "../src/adapter";
import { endpoint } from "../src/define/endpoint";
import type { SSEContext, SSEEvent } from "../src/realtime/types";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import type { StudioHooks } from "../src/studio/hooks";

/**
 * Zero-arg `createHandler()` reads sources lazily from the core global
 * registry. Tests register the sources first and then create the handler
 * so the request-time `requireSources()` lookup returns the expected dict.
 */
function setupHandler(sources: unknown, config?: Parameters<typeof createHandler>[0]) {
  registerSources((sources ?? {}) as Parameters<typeof registerSources>[0]);
  return createHandler(config);
}

/** Helper: create a source with an SSE endpoint */
function createSSESource(
  handler: (ctx: SSEContext) => AsyncGenerator<SSEEvent, void, unknown>,
) {
  const feed = endpoint<unknown, unknown>({ transport: "sse" })(handler);
  return {
    testSource: {
      options: {
        groups: {
          notifications: {
            options: {},
            feed,
          },
        },
      },
      feed, // also at root for groupless test
    },
  };
}

/** Helper: collect all chunks from SSE response as text */
async function collectSSEText(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

/** Helper: build SSE GET request */
function sseRequest(params: string, headers?: Record<string, string>): Request {
  return new Request(`http://localhost/api/sse?${params}`, {
    headers: { Accept: "text/event-stream", ...headers },
  });
}

const HOOKS_KEY = Symbol.for("courier.studio.hooks");
const hooks = (globalThis as Record<symbol, unknown>)[HOOKS_KEY] as StudioHooks;

/** Install mock studio hooks on the shared singleton, returns cleanup fn */
function installHooks(overrides: Partial<StudioHooks>): () => void {
  Object.assign(hooks, overrides);
  return () => {
    for (const key of Object.keys(overrides)) {
      delete (hooks as Record<string, unknown>)[key];
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  _resetSourcesForTests();
});

describe("handleSSE", () => {
  it("returns 400 when _s is missing", async () => {
    const { handleSSE } = setupHandler({});
    const res = await handleSSE(sseRequest("_m=feed"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when _m is missing", async () => {
    const { handleSSE } = setupHandler({});
    const res = await handleSSE(sseRequest("_s=testSource"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown source", async () => {
    const { handleSSE } = setupHandler({});
    const res = await handleSSE(sseRequest("_s=unknown&_m=feed"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("source not found");
  });

  it("returns 400 for non-SSE endpoint", async () => {
    const httpEndpoint = endpoint<string>()((http) => http.get("/test"));
    const sources = {
      api: { options: { groups: {} }, health: httpEndpoint },
    };
    const { handleSSE } = setupHandler(sources);
    const res = await handleSSE(sseRequest("_s=api&_m=health"));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("not an SSE transport");
  });

  it("streams SSE events from generator", async () => {
    const sources = createSSESource(async function* () {
      yield { data: { msg: "hello" } };
      yield { data: { msg: "world" } };
    });

    const { handleSSE } = setupHandler(sources);
    const res = await handleSSE(sseRequest("_s=testSource&_m=feed"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const text = await collectSSEText(res);
    expect(text).toContain('data: {"msg":"hello"}');
    expect(text).toContain('data: {"msg":"world"}');
  });

  it("includes sequential IDs on events", async () => {
    const sources = createSSESource(async function* () {
      yield { data: "a" };
      yield { data: "b" };
    });

    const { handleSSE } = setupHandler(sources);
    const res = await handleSSE(sseRequest("_s=testSource&_m=feed"));
    const text = await collectSSEText(res);

    expect(text).toContain("id: 1");
    expect(text).toContain("id: 2");
  });

  it("preserves custom event id", async () => {
    const sources = createSSESource(async function* () {
      yield { id: "custom-42", data: "test" };
    });

    const { handleSSE } = setupHandler(sources);
    const res = await handleSSE(sseRequest("_s=testSource&_m=feed"));
    const text = await collectSSEText(res);

    expect(text).toContain("id: custom-42");
  });

  it("passes Last-Event-ID to handler context", async () => {
    let receivedLastEventId: string | undefined;

    const sources = createSSESource(async function* (ctx) {
      receivedLastEventId = ctx.lastEventId;
      yield { data: "ok" };
    });

    const { handleSSE } = setupHandler(sources);
    await collectSSEText(
      await handleSSE(sseRequest("_s=testSource&_m=feed", { "Last-Event-ID": "99" })),
    );

    expect(receivedLastEventId).toBe("99");
  });

  it("passes variables to handler context", async () => {
    let receivedVars: unknown;

    const sources = createSSESource(async function* (ctx) {
      receivedVars = ctx.variables;
      yield { data: "ok" };
    });

    const { handleSSE } = setupHandler(sources);
    await collectSSEText(
      await handleSSE(sseRequest("_s=testSource&_m=feed&userId=123&channel=news")),
    );

    expect(receivedVars).toEqual({ userId: "123", channel: "news" });
  });

  it("sends error event on generator throw", async () => {
    const sources = createSSESource(async function* () {
      yield { data: "before" };
      throw new Error("stream broke");
    });

    const { handleSSE } = setupHandler(sources);
    const res = await handleSSE(sseRequest("_s=testSource&_m=feed"));
    const text = await collectSSEText(res);

    expect(text).toContain("event: error");
    expect(text).toContain("stream broke");
  });

  it("has correct SSE response headers", async () => {
    const sources = createSSESource(async function* () {
      yield { data: "x" };
    });

    const { handleSSE } = setupHandler(sources);
    const res = await handleSSE(sseRequest("_s=testSource&_m=feed"));

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
  });
});

describe("handleSSE — studio hooks", () => {
  it("emits onStreamOpen with correct payload", async () => {
    const onStreamOpen = vi.fn();
    const cleanup = installHooks({ onStreamOpen });

    const sources = createSSESource(async function* () {
      yield { data: "x" };
    });

    const { handleSSE } = setupHandler(sources);
    const res = await handleSSE(sseRequest("_s=testSource&_g=notifications&_m=feed"));
    await collectSSEText(res);

    expect(onStreamOpen).toHaveBeenCalledOnce();
    expect(onStreamOpen.mock.calls[0]![0]).toMatchObject({
      source: "testSource",
      group: "notifications",
      method: "feed",
      transport: "sse",
    });
    expect(onStreamOpen.mock.calls[0]![0].requestId).toBeTruthy();

    cleanup();
  });

  it("uses x-courier-playground-rid header as requestId when present (Studio Playground correlation)", async () => {
    const onStreamOpen = vi.fn();
    const onStreamMessage = vi.fn();
    const onStreamClose = vi.fn();
    const cleanup = installHooks({ onStreamOpen, onStreamMessage, onStreamClose });

    const sources = createSSESource(async function* () {
      yield { data: "first" };
      yield { data: "second" };
    });

    const { handleSSE } = setupHandler(sources);
    const PLAYGROUND_RID = "playground-rid-abc-123";
    const res = await handleSSE(
      sseRequest("_s=testSource&_g=notifications&_m=feed", {
        "x-courier-playground-rid": PLAYGROUND_RID,
      }),
    );
    await collectSSEText(res);

    // Every event hook fires with the playground requestId — that's the
    // correlation that lets the Studio UI playground tab attribute these
    // events to the Subscribe click that initiated them.
    expect(onStreamOpen.mock.calls[0]![0].requestId).toBe(PLAYGROUND_RID);
    expect(onStreamMessage.mock.calls[0]![0].requestId).toBe(PLAYGROUND_RID);
    expect(onStreamMessage.mock.calls[1]![0].requestId).toBe(PLAYGROUND_RID);
    expect(onStreamClose.mock.calls[0]![0].requestId).toBe(PLAYGROUND_RID);

    cleanup();
  });

  it("falls back to generated requestId when x-courier-playground-rid is absent", async () => {
    const onStreamOpen = vi.fn();
    const cleanup = installHooks({ onStreamOpen });

    const sources = createSSESource(async function* () {
      yield { data: "x" };
    });

    const { handleSSE } = setupHandler(sources);
    const res = await handleSSE(sseRequest("_s=testSource&_m=feed"));
    await collectSSEText(res);

    const rid = onStreamOpen.mock.calls[0]![0].requestId;
    // Generated id is non-empty and does not look like our playground stub.
    expect(rid).toBeTruthy();
    expect(rid).not.toBe("playground-rid-abc-123");

    cleanup();
  });

  it("registers in playground abort registry when x-courier-playground-rid is set, and abortPlayground force-closes the stream", async () => {
    const { abortPlayground, playgroundAbortRegistrySize, clearPlaygroundAbortRegistry } =
      await import("../src/studio");
    clearPlaygroundAbortRegistry();

    const onStreamOpen = vi.fn();
    const onStreamMessage = vi.fn();
    const onStreamClose = vi.fn();
    const cleanup = installHooks({ onStreamOpen, onStreamMessage, onStreamClose });

    // Long-running generator — yields one event then waits forever on the
    // signal. Without abort registry → never exits → test hangs.
    const sources = createSSESource(async function* (ctx) {
      yield { data: "first" };
      // Sleep on a non-signal-aware promise: simulates the loopback abort
      // bug where ctx.signal never fires. The ONLY thing that can break this
      // out is a synchronous force-abort via the registry.
      await new Promise((resolve) => {
        ctx.signal.addEventListener("abort", resolve, { once: true });
      });
      // After abort, the loop check exits naturally.
    });

    const PLAYGROUND_RID = "rid-end-to-end-cancel";
    const { handleSSE } = setupHandler(sources);

    // Start the SSE stream — do NOT await collectSSEText (it would hang).
    const responsePromise = handleSSE(
      sseRequest("_s=testSource&_g=notifications&_m=feed", {
        "x-courier-playground-rid": PLAYGROUND_RID,
      }),
    );

    // Microtask gap so the handler runs to the registration point.
    await new Promise((r) => setTimeout(r, 10));

    // The handler should have registered its abort callback by now.
    expect(playgroundAbortRegistrySize()).toBe(1);

    // Force-abort via the registry — this is what the playground executor
    // does in its onAbort branch.
    expect(abortPlayground(PLAYGROUND_RID)).toBe(true);

    // Drain the response so the handler's stream can complete.
    const res = await responsePromise;
    await collectSSEText(res);

    // The first event was sent successfully.
    expect(onStreamMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: PLAYGROUND_RID }),
    );
    // The stream closed (any reason — could be "complete" if the generator
    // returned cleanly after the signal-aware sleep, or "disconnect" if the
    // force-abort triggered the registry's disconnect path).
    expect(onStreamClose).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: PLAYGROUND_RID }),
    );
    // The registry entry was unregistered in the cleanup branch.
    expect(playgroundAbortRegistrySize()).toBe(0);

    cleanup();
  });

  it("emits onStreamMessage for each event", async () => {
    const onStreamMessage = vi.fn();
    const onStreamOpen = vi.fn();
    const cleanup = installHooks({ onStreamOpen, onStreamMessage });

    const sources = createSSESource(async function* () {
      yield { data: "a" };
      yield { event: "update", data: "b" };
    });

    const { handleSSE } = setupHandler(sources);
    const res = await handleSSE(sseRequest("_s=testSource&_m=feed"));
    await collectSSEText(res);

    expect(onStreamMessage).toHaveBeenCalledTimes(2);
    expect(onStreamMessage.mock.calls[0]![0]).toMatchObject({ seq: 1 });
    expect(onStreamMessage.mock.calls[1]![0]).toMatchObject({ seq: 2, eventType: "update" });

    cleanup();
  });

  it("emits onStreamClose with reason complete", async () => {
    const onStreamClose = vi.fn();
    const onStreamOpen = vi.fn();
    const cleanup = installHooks({ onStreamOpen, onStreamClose });

    const sources = createSSESource(async function* () {
      yield { data: "done" };
    });

    const { handleSSE } = setupHandler(sources);
    const res = await handleSSE(sseRequest("_s=testSource&_m=feed"));
    await collectSSEText(res);

    expect(onStreamClose).toHaveBeenCalledOnce();
    expect(onStreamClose.mock.calls[0]![0]).toMatchObject({
      reason: "complete",
      eventCount: 1,
    });
    expect(onStreamClose.mock.calls[0]![0].duration).toBeGreaterThanOrEqual(0);
    expect(onStreamClose.mock.calls[0]![0].totalBytes).toBeGreaterThan(0);

    cleanup();
  });

  it("emits onStreamClose with reason error on generator throw", async () => {
    const onStreamClose = vi.fn();
    const onStreamOpen = vi.fn();
    const cleanup = installHooks({ onStreamOpen, onStreamClose });

    const sources = createSSESource(async function* () {
      throw new Error("boom");
    });

    const { handleSSE } = setupHandler(sources);
    const res = await handleSSE(sseRequest("_s=testSource&_m=feed"));
    await collectSSEText(res);

    expect(onStreamClose).toHaveBeenCalledOnce();
    expect(onStreamClose.mock.calls[0]![0].reason).toBe("error");

    cleanup();
  });
});

describe("handleSSE — variable extraction", () => {
  it("excludes meta keys (_s, _g, _m, _o, _transport) from variables", async () => {
    let receivedVars: unknown;

    const sources = createSSESource(async function* (ctx) {
      receivedVars = ctx.variables;
      yield { data: "ok" };
    });

    const { handleSSE } = setupHandler(sources);
    await collectSSEText(
      await handleSSE(
        sseRequest("_s=testSource&_m=feed&_g=notifications&_transport=sse&_o={}&userId=42"),
      ),
    );

    expect(receivedVars).toEqual({ userId: "42" });
  });

  it("returns empty object when only meta keys present", async () => {
    let receivedVars: unknown = "sentinel";

    const sources = createSSESource(async function* (ctx) {
      receivedVars = ctx.variables;
      yield { data: "ok" };
    });

    const { handleSSE } = setupHandler(sources);
    await collectSSEText(await handleSSE(sseRequest("_s=testSource&_m=feed")));

    expect(receivedVars).toEqual({});
  });
});

describe("handleSSE — connection registry", () => {
  it("exposes sseConnections on handler", () => {
    const { sseConnections } = setupHandler({});
    expect(sseConnections).toBeDefined();
    expect(sseConnections.count).toBe(0);
    expect(typeof sseConnections.list).toBe("function");
  });

  it("tracks active connections during streaming", async () => {
    let resolve: () => void;
    const blocker = new Promise<void>((r) => { resolve = r; });

    const sources = createSSESource(async function* () {
      yield { data: "hello" };
      await blocker;
    });

    const handler = setupHandler(sources);
    const res = await handler.handleSSE(sseRequest("_s=testSource&_m=feed"));

    // Start reading without consuming all
    const reader = res.body!.getReader();
    await reader.read(); // read first chunk

    expect(handler.sseConnections.count).toBe(1);
    const conn = handler.sseConnections.list()[0]!;
    expect(conn.source).toBe("testSource");
    expect(conn.method).toBe("feed");
    expect(conn.connectionId).toBeTruthy();

    resolve!();
    // Drain remaining
    while (!(await reader.read()).done) { /* drain */ }

    // After stream completes, connection is removed
    expect(handler.sseConnections.count).toBe(0);
  });

  it("returns 503 when maxSSEConnections exceeded", async () => {
    let resolve: () => void;
    const blocker = new Promise<void>((r) => { resolve = r; });

    const sources = createSSESource(async function* () {
      yield { data: "hold" };
      await blocker;
    });

    const handler = setupHandler(sources, { maxSSEConnections: 1 });

    // First connection succeeds
    const res1 = await handler.handleSSE(sseRequest("_s=testSource&_m=feed"));
    expect(res1.status).toBe(200);

    // Start consuming to register the connection
    const reader = res1.body!.getReader();
    await reader.read();

    // Second connection rejected
    const res2 = await handler.handleSSE(sseRequest("_s=testSource&_m=feed"));
    expect(res2.status).toBe(503);
    expect(res2.headers.get("Retry-After")).toBe("5");

    resolve!();
    while (!(await reader.read()).done) { /* drain */ }
  });

  it("returns 503 during shutdown", async () => {
    const sources = createSSESource(async function* () {
      yield { data: "x" };
    });

    const handler = setupHandler(sources);
    await handler.shutdownSSE({ drainMs: 10 });

    const res = await handler.handleSSE(sseRequest("_s=testSource&_m=feed"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3");
  });
});

describe("handleSSE — lifecycle hooks", () => {
  it("calls onSSEConnect and stores metadata", async () => {
    const onSSEConnect = vi.fn().mockResolvedValue({ userId: "42" });

    const sources = createSSESource(async function* () {
      yield { data: "x" };
    });

    const handler = setupHandler(sources, { onSSEConnect });
    const res = await handler.handleSSE(sseRequest("_s=testSource&_m=feed"));
    await collectSSEText(res);

    expect(onSSEConnect).toHaveBeenCalledOnce();
    expect(onSSEConnect.mock.calls[0]![0]).toMatchObject({
      source: "testSource",
      method: "feed",
    });
    expect(onSSEConnect.mock.calls[0]![0].connectionId).toBeTruthy();
  });

  it("rejects connection when onSSEConnect throws", async () => {
    const onSSEConnect = vi.fn().mockRejectedValue(new Error("forbidden"));

    const sources = createSSESource(async function* () {
      yield { data: "x" };
    });

    const handler = setupHandler(sources, { onSSEConnect });
    const res = await handler.handleSSE(sseRequest("_s=testSource&_m=feed"));
    expect(res.status).toBe(403);
  });

  it("calls onSSEDisconnect on stream close", async () => {
    const onSSEDisconnect = vi.fn();

    const sources = createSSESource(async function* () {
      yield { data: "x" };
    });

    const handler = setupHandler(sources, { onSSEDisconnect });
    const res = await handler.handleSSE(sseRequest("_s=testSource&_m=feed"));
    await collectSSEText(res);

    expect(onSSEDisconnect).toHaveBeenCalledOnce();
    expect(onSSEDisconnect.mock.calls[0]![0]).toMatchObject({
      reason: "complete",
      eventCount: 1,
    });
    expect(onSSEDisconnect.mock.calls[0]![0].connectionId).toBeTruthy();
    expect(onSSEDisconnect.mock.calls[0]![0].duration).toBeGreaterThanOrEqual(0);
  });

  it("calls onSSEError on generator throw", async () => {
    const onSSEError = vi.fn();

    const sources = createSSESource(async function* () {
      throw new Error("boom");
    });

    const handler = setupHandler(sources, { onSSEError });
    const res = await handler.handleSSE(sseRequest("_s=testSource&_m=feed"));
    await collectSSEText(res);

    expect(onSSEError).toHaveBeenCalledOnce();
    expect(onSSEError.mock.calls[0]![0].error).toBeInstanceOf(Error);
  });
});

describe("handleSSE — getByEndpoint", () => {
  it("filters connections by endpoint", async () => {
    let resolve: () => void;
    const blocker = new Promise<void>((r) => { resolve = r; });

    const sources = createSSESource(async function* () {
      yield { data: "hello" };
      await blocker;
    });

    const handler = setupHandler(sources);
    const res = await handler.handleSSE(sseRequest("_s=testSource&_m=feed"));
    const reader = res.body!.getReader();
    await reader.read();

    const conns = handler.sseConnections.getByEndpoint("testSource", undefined, "feed");
    expect(conns).toHaveLength(1);

    const noMatch = handler.sseConnections.getByEndpoint("other");
    expect(noMatch).toHaveLength(0);

    resolve!();
    while (!(await reader.read()).done) { /* drain */ }
  });
});

describe("handle (auto-routing)", () => {
  it("routes SSE requests by Accept header", async () => {
    const sources = createSSESource(async function* () {
      yield { data: "routed" };
    });

    const { handle } = setupHandler(sources);
    const req = new Request("http://localhost/api/sse?_s=testSource&_m=feed", {
      headers: { Accept: "text/event-stream" },
    });
    const res = await handle(req);

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("routes SSE requests by _transport query param", async () => {
    const sources = createSSESource(async function* () {
      yield { data: "routed" };
    });

    const { handle } = setupHandler(sources);
    const req = new Request(
      "http://localhost/api/sse?_s=testSource&_m=feed&_transport=sse",
    );
    const res = await handle(req);

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });
});
