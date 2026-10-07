import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError, ConnectionError, ForbiddenError } from "../src/realtime/errors";
import { subscribeSSE } from "../src/realtime/sse/sse-client";

/** Helper: create a mock fetch response with SSE stream */
function mockSSEResponse(body: string, status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** Collect all events from a subscription (with safety timeout) */
async function drain<T>(sub: AsyncIterable<T>, max = 100): Promise<T[]> {
  const events: T[] = [];
  for await (const event of sub) {
    events.push(event);
    if (events.length >= max) break;
  }
  return events;
}

describe("subscribeSSE", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("yields parsed SSE events as async iterable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          mockSSEResponse(
            'data: {"msg":"hello"}\n\ndata: {"msg":"world"}\n\nevent: courier:complete\ndata: null\n\n',
          ),
        ),
    );

    const sub = subscribeSSE<{ msg: string }>("/sse", { maxAttempts: 1 });
    const events = await drain(sub);

    expect(events.map((e) => e.data)).toEqual([{ msg: "hello" }, { msg: "world" }]);
  });

  it("sends Accept and custom headers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockSSEResponse('data: "ok"\n\nevent: courier:complete\ndata: null\n\n'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const sub = subscribeSSE("/sse", {
      headers: { Authorization: "Bearer token123" },
      maxAttempts: 1,
    });

    await drain(sub);

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    const sent = new Headers(init.headers);
    expect(sent.get("accept")).toBe("text/event-stream");
    expect(sent.get("authorization")).toBe("Bearer token123");
  });

  it("sends Last-Event-ID on reconnect", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockSSEResponse('id: evt-2\ndata: "a"\n\n'))
      .mockResolvedValueOnce(
        mockSSEResponse('data: "b"\n\nevent: courier:complete\ndata: null\n\n'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const sub = subscribeSSE("/sse", {
      maxAttempts: 2,
      backoff: { initialMs: 1, jitter: false },
    });

    await drain(sub);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(new Headers(secondInit.headers).get("last-event-id")).toBe("evt-2");
  });

  it("transitions through connected → disconnected statuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          mockSSEResponse('data: "x"\n\nevent: courier:complete\ndata: null\n\n'),
        ),
    );

    const sub = subscribeSSE("/sse", { maxAttempts: 1 });
    const statuses: string[] = [];
    // "connecting" may fire before listener is attached (sync start)
    sub.on("status", (s) => statuses.push(s));

    await drain(sub);

    expect(statuses).toContain("connected");
    expect(statuses).toContain("disconnected");
    expect(sub.status).toBe("disconnected");
  });

  it("close() terminates the subscription", async () => {
    // Pre-abort so fetch throws immediately
    const ac = new AbortController();
    ac.abort();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));

    const sub = subscribeSSE("/sse", { signal: ac.signal });

    const result = await sub[Symbol.asyncIterator]().next();
    expect(result.done).toBe(true);
    expect(sub.status).toBe("disconnected");
  });

  it("hands over nothing it had buffered once closed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(mockSSEResponse("data: 1\n\ndata: 2\n\ndata: 3\n\n")),
    );
    const sub = subscribeSSE<number>("/sse", { maxAttempts: 1 });
    /* Nothing reads yet, so the three events wait in the buffer. */
    await new Promise((resolve) => setTimeout(resolve, 20));

    sub.close();

    expect(await drain(sub)).toEqual([]);
  });

  it("does not reconnect on 401, and rejects with an AuthError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockSSEResponse("", 401));
    vi.stubGlobal("fetch", fetchMock);

    const sub = subscribeSSE("/sse");

    await expect(drain(sub)).rejects.toBeInstanceOf(AuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sub.status).toBe("disconnected");
  });

  it("does not reconnect on 403, and rejects with a ForbiddenError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockSSEResponse("", 403));
    vi.stubGlobal("fetch", fetchMock);

    const sub = subscribeSSE("/sse");

    await expect(drain(sub)).rejects.toBeInstanceOf(ForbiddenError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips an event whose data cannot be parsed, and logs only an excerpt of it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = `not json ${"x".repeat(5000)} %c`;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          mockSSEResponse(
            `data: ${secret}\n\ndata: {"ok":true}\n\nevent: courier:complete\ndata: null\n\n`,
          ),
        ),
    );

    const events = await drain(subscribeSSE<{ ok: boolean }>("/sse", { maxAttempts: 1 }));

    expect(events.map((e) => e.data)).toEqual([{ ok: true }]);
    const skipped = warn.mock.calls.find((call) => String(call[1]).includes("could not be parsed"));
    expect(String(skipped?.[1]).length).toBeLessThan(400);
    expect(String(skipped?.[1])).toContain(`${secret.length} characters`);
    expect(skipped?.[2]).toBeInstanceOf(SyntaxError);
    warn.mockRestore();
  });

  it("uses custom parse function", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          mockSSEResponse("data: HELLO\n\nevent: courier:complete\ndata: null\n\n"),
        ),
    );

    const sub = subscribeSSE<string>("/sse", {
      maxAttempts: 1,
      parse: (raw) => raw.toLowerCase(),
    });

    const events = await drain(sub);
    expect(events.map((e) => e.data)).toEqual(["hello"]);
  });

  it("respects maxAttempts limit", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Network error"));
    vi.stubGlobal("fetch", fetchMock);

    const sub = subscribeSSE("/sse", {
      maxAttempts: 3,
      backoff: { initialMs: 1, jitter: false },
    });

    await expect(drain(sub)).rejects.toBeInstanceOf(ConnectionError);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sub.status).toBe("disconnected");
  });

  it("reconnects on 500 (retriable)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockSSEResponse("", 500))
      .mockResolvedValueOnce(
        mockSSEResponse('data: "ok"\n\nevent: courier:complete\ndata: null\n\n'),
      );
    vi.stubGlobal("fetch", fetchMock);

    const sub = subscribeSSE("/sse", {
      maxAttempts: 2,
      backoff: { initialMs: 1, jitter: false },
    });

    const events = await drain(sub);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(1);
  });

  it("respects external AbortSignal (pre-aborted)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));

    const ac = new AbortController();
    ac.abort(); // Pre-abort

    const sub = subscribeSSE("/sse", { signal: ac.signal });
    const events = await drain(sub);

    expect(events).toHaveLength(0);
    expect(sub.status).toBe("disconnected");
  });

  it("preserves event id and event type in yielded events", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          mockSSEResponse(
            'id: 42\nevent: notification\ndata: "payload"\n\nevent: courier:complete\ndata: null\n\n',
          ),
        ),
    );

    const sub = subscribeSSE("/sse", { maxAttempts: 1 });
    const events = await drain(sub);

    expect(events[0]).toMatchObject({
      id: "42",
      event: "notification",
      data: "payload",
    });
  });
});

/**
 * A stream its reader ends reports itself disconnected, not the status it
 * had — connected — so an indicator bound to it never shows a live stream
 * that is gone.
 */
describe("a stream its reader ended", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports itself disconnected after close(), and tells its listeners", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(mockSSEResponse('data: "a"\n\ndata: "b"\n\n')),
    );
    const sub = subscribeSSE<string>("/sse", { maxAttempts: 1 });
    const statuses: string[] = [];
    sub.on("status", (status) => statuses.push(status));

    for await (const event of sub) {
      if (event.data === "b") sub.close();
    }

    expect(sub.status).toBe("disconnected");
    expect(statuses.at(-1)).toBe("disconnected");
  });

  it("reports itself disconnected when a loop over it is left early", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(mockSSEResponse('data: "a"\n\ndata: "b"\n\n')),
    );
    const sub = subscribeSSE<string>("/sse", { maxAttempts: 1 });

    for await (const _event of sub) break;

    expect(sub.status).toBe("disconnected");
  });
});
