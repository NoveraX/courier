import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { courier } from "../src/define/courier";
import type { WrapMiddleware } from "../src/middleware/types";
import type { SSEContext, SSEEvent } from "../src/realtime/types";
import type { StudioHooks } from "../src/studio/hooks";
import { ValidationError } from "../src/validation";
import { executeDirectSSE } from "../src/transport/in-process/sse";

const { endpoint, stream } = courier();

const HOOKS_KEY = Symbol.for("courier.studio.hooks");
const hooks = (globalThis as Record<symbol, unknown>)[HOOKS_KEY] as StudioHooks;

function installHooks(overrides: Partial<StudioHooks>): () => void {
  Object.assign(hooks, overrides);
  return () => {
    for (const key of Object.keys(overrides)) {
      delete (hooks as Record<string, unknown>)[key];
    }
  };
}

function makeSources(
  handler: (ctx: SSEContext) => AsyncGenerator<SSEEvent, void, unknown>,
  opts: {
    variablesSchema?: z.ZodTypeAny;
    middleware?: WrapMiddleware[];
  } = {},
) {
  const feed = stream.variables(opts.variablesSchema).response<unknown>().implement(handler);
  // Use a plain object source so we can attach middleware via options.
  return {
    api: {
      options: {
        middleware: opts.middleware ?? [],
        groups: { chat: { options: {}, feed } },
      },
      feed,
    },
  };
}

async function collect<T>(iter: AsyncIterable<SSEEvent<T>>, max = 10): Promise<SSEEvent<T>[]> {
  const out: SSEEvent<T>[] = [];
  for await (const ev of iter) {
    out.push(ev);
    if (out.length >= max) break;
  }
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("executeDirectSSE — resolution", () => {
  it("throws when source not found", async () => {
    const sources = makeSources(async function* () {
      yield { data: 1 };
    });
    await expect(
      executeDirectSSE(sources as any, { source: "missing", method: "feed" }),
    ).rejects.toThrow(/failed to resolve/);
  });

  it("throws when endpoint is not SSE transport", async () => {
    const httpEndpoint = endpoint.response<string>().get("/x");
    const sources = { api: { options: { groups: {} }, health: httpEndpoint } };
    await expect(
      executeDirectSSE(sources as any, { source: "api", method: "health" }),
    ).rejects.toThrow(/failed to resolve/);
  });

  it("attaches status on resolution error cause", async () => {
    const sources = makeSources(async function* () {
      yield { data: 1 };
    });
    try {
      await executeDirectSSE(sources as any, { source: "missing", method: "feed" });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error & { cause?: { status?: number } }).cause?.status).toBe(400);
    }
  });
});

describe("executeDirectSSE — variables validation", () => {
  it("passes validated variables to handler context", async () => {
    let received: unknown;
    const sources = makeSources(
      async function* (ctx) {
        received = ctx.variables;
        yield { data: "ok" };
      },
      { variablesSchema: z.object({ id: z.coerce.number() }) },
    );

    const sub = await executeDirectSSE(sources as any, {
      source: "api",
      group: "chat",
      method: "feed",
      variables: { id: "42" },
    });
    await collect(sub);
    expect(received).toEqual({ id: 42 });
  });

  it("throws ValidationError on invalid variables BEFORE opening stream", async () => {
    const onStreamOpen = vi.fn();
    const cleanup = installHooks({ onStreamOpen });

    const sources = makeSources(
      async function* () {
        yield { data: "ok" };
      },
      { variablesSchema: z.object({ id: z.string() }) },
    );

    await expect(
      executeDirectSSE(sources as any, {
        source: "api",
        group: "chat",
        method: "feed",
        variables: { id: 123 },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(onStreamOpen).not.toHaveBeenCalled();
    cleanup();
  });
});

describe("executeDirectSSE — middleware error paths", () => {
  it("propagates middleware throw as a rejection BEFORE opening the stream", async () => {
    const onStreamOpen = vi.fn();
    const cleanup = installHooks({ onStreamOpen });

    const sources = makeSources(
      async function* () {
        yield { data: "ok" };
      },
      {
        middleware: [
          {
            name: "boom",
            phase: "wrap",
            handler: async () => {
              throw new Error("middleware exploded");
            },
          },
        ],
      },
    );

    await expect(
      executeDirectSSE(sources as any, { source: "api", group: "chat", method: "feed" }),
    ).rejects.toThrow("middleware exploded");
    expect(onStreamOpen).not.toHaveBeenCalled();
    cleanup();
  });

  it("rejects with timeout when middleware exceeds the canonical limit", async () => {
    // LIMITS.MIDDLEWARE_TIMEOUT_MS is 30s — we use fake timers to advance
    // past it without waiting in real time. The middleware itself never
    // resolves, so only the timeout's reject path can settle the race.
    vi.useFakeTimers();
    try {
      const sources = makeSources(
        async function* () {
          yield { data: "ok" };
        },
        {
          middleware: [
            {
              name: "stuck",
              phase: "wrap",
              handler: () => new Promise(() => {}),
            },
          ],
        },
      );

      const promise = executeDirectSSE(sources as any, {
        source: "api",
        group: "chat",
        method: "feed",
      });
      // Attach the catch BEFORE advancing timers so the rejection has a
      // listener (avoids unhandled-rejection noise inside vitest).
      const assertion = expect(promise).rejects.toThrow(/middleware timeout/i);
      await vi.advanceTimersByTimeAsync(31_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("executeDirectSSE — headers + middleware", () => {
  it("delivers user headers into ctx.headers via middleware", async () => {
    let receivedHeaders: Headers | undefined;
    const sources = makeSources(async function* (ctx) {
      receivedHeaders = ctx.headers;
      yield { data: "ok" };
    });

    const sub = await executeDirectSSE(sources as any, {
      source: "api",
      group: "chat",
      method: "feed",
      headers: { authorization: "Bearer secret" },
    });
    await collect(sub);
    expect(receivedHeaders?.get("authorization")).toBe("Bearer secret");
  });

  it("respects the source's allowedHeaders whitelist", async () => {
    // Headers not in `ALLOWED_HEADERS` (default) and not added to the
    // source's `allowedHeaders` extension are filtered out before reaching
    // the handler. This mirrors the canonical HTTP/SSE behaviour and is the
    // production trust boundary for arbitrary user headers.
    let receivedHeaders: Headers | undefined;
    const sources = {
      api: {
        options: {
          allowedHeaders: ["x-tenant-id"],
          groups: {
            chat: {
              options: {},
              feed: stream.variables<unknown>().response<unknown>().implement(async function* (ctx) {
                receivedHeaders = ctx.headers;
                yield { data: "ok" };
              }),
            },
          },
        },
      },
    };

    const sub = await executeDirectSSE(sources as any, {
      source: "api",
      group: "chat",
      method: "feed",
      headers: {
        authorization: "Bearer ok", // in ALLOWED_HEADERS by default
        "x-tenant-id": "acme", // explicitly whitelisted
        "x-debug-secret": "should-be-stripped", // NOT whitelisted
      },
    });
    await collect(sub);

    expect(receivedHeaders?.get("authorization")).toBe("Bearer ok");
    expect(receivedHeaders?.get("x-tenant-id")).toBe("acme");
    expect(receivedHeaders?.get("x-debug-secret")).toBeNull();
  });

  it("runs middleware chain in order and lets it mutate headers", async () => {
    const order: string[] = [];
    const sources = makeSources(
      async function* (ctx) {
        order.push(`handler:${ctx.headers.get("x-stamp")}`);
        yield { data: "ok" };
      },
      {
        middleware: [
          {
            name: "mw1",
            phase: "wrap",
            handler: async (ctx, next) => {
              order.push("mw1:enter");
              ctx.headers.set("x-stamp", "via-mw");
              const r = await next();
              order.push("mw1:exit");
              return r;
            },
          },
        ],
      },
    );

    const sub = await executeDirectSSE(sources as any, {
      source: "api",
      group: "chat",
      method: "feed",
    });
    await collect(sub);
    expect(order).toEqual(["mw1:enter", "mw1:exit", "handler:via-mw"]);
  });
});

describe("executeDirectSSE — studio instrumentation", () => {
  it("emits onStreamOpen exactly once with mode=direct", async () => {
    const onStreamOpen = vi.fn();
    const onStreamClose = vi.fn();
    const cleanup = installHooks({ onStreamOpen, onStreamClose });

    const sources = makeSources(async function* () {
      yield { data: "x" };
    });
    const sub = await executeDirectSSE(sources as any, {
      source: "api",
      group: "chat",
      method: "feed",
      headers: { authorization: "Bearer t" },
    });
    await collect(sub);

    // beginStream emits open once; updateMeta re-emits with same requestId
    // (merge in store), but for the executor + complete lifecycle that's
    // exactly two calls with identical requestId.
    expect(onStreamOpen).toHaveBeenCalled();
    const ids = new Set(onStreamOpen.mock.calls.map((c) => (c[0] as { requestId: string }).requestId));
    expect(ids.size).toBe(1);
    const last = onStreamOpen.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(last).toMatchObject({
      transport: "sse",
      mode: "direct",
      source: "api",
      group: "chat",
      method: "feed",
    });
    expect((last.requestHeaders as Record<string, string>).authorization).toBe("Bearer t");
    expect((last.responseHeaders as Record<string, string>).authorization).toBe("Bearer t");
    expect(onStreamClose).toHaveBeenCalledOnce();
    cleanup();
  });

  it("emits onStreamClose with reason=complete after iterator drains", async () => {
    const onStreamClose = vi.fn();
    const cleanup = installHooks({ onStreamOpen: vi.fn(), onStreamMessage: vi.fn(), onStreamClose });
    const sources = makeSources(async function* () {
      yield { data: 1 };
      yield { data: 2 };
    });
    const sub = await executeDirectSSE(sources as any, { source: "api", group: "chat", method: "feed" });
    await collect(sub);
    expect(onStreamClose.mock.calls[0]![0]).toMatchObject({ reason: "complete", eventCount: 2 });
    cleanup();
  });

  it("emits onStreamError + onStreamClose(error) when handler throws", async () => {
    const onStreamError = vi.fn();
    const onStreamClose = vi.fn();
    const cleanup = installHooks({ onStreamOpen: vi.fn(), onStreamError, onStreamClose });

    const sources = makeSources(async function* () {
      yield { data: "before" };
      throw new Error("boom");
    });
    const sub = await executeDirectSSE(sources as any, { source: "api", group: "chat", method: "feed" });

    await expect(collect(sub)).rejects.toThrow("boom");
    expect(onStreamError).toHaveBeenCalledOnce();
    expect(onStreamClose.mock.calls[0]![0].reason).toBe("error");
    cleanup();
  });
});

describe("executeDirectSSE — cancellation", () => {
  it("aborts the handler signal when external AbortSignal fires", async () => {
    const ac = new AbortController();
    let observed = false;
    const sources = makeSources(async function* (ctx) {
      ctx.signal.addEventListener("abort", () => {
        observed = true;
      });
      yield { data: "first" };
      await new Promise((r) => setTimeout(r, 5));
      yield { data: "second" };
    });
    const sub = await executeDirectSSE(
      sources as any,
      { source: "api", group: "chat", method: "feed" },
      { signal: ac.signal },
    );
    const iter = sub[Symbol.asyncIterator]();
    await iter.next();
    ac.abort();
    // Drain — generator should observe abort on subsequent yields.
    await iter.return?.(undefined);
    expect(observed).toBe(true);
  });

  it("close() aborts handler ctx.signal", async () => {
    let observed = false;
    const sources = makeSources(async function* (ctx) {
      ctx.signal.addEventListener("abort", () => {
        observed = true;
      });
      yield { data: "x" };
    });
    const sub = await executeDirectSSE(sources as any, { source: "api", group: "chat", method: "feed" });
    const iter = sub[Symbol.asyncIterator]();
    await iter.next();
    sub.close();
    expect(observed).toBe(true);
  });
});
