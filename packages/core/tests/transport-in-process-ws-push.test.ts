import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { courier } from "../src/define/courier";
import { RealtimeValidationError } from "../src/realtime/errors";
import type { WSContext } from "../src/realtime/types";
import type { StudioHooks } from "../src/studio/hooks";
import { executeDirectWSPush } from "../src/transport/in-process/ws-push";
import { ValidationError } from "../src/validation";

const { endpoint, channel } = courier();

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

function makePushSources(
  handler: (ctx: WSContext) => AsyncGenerator<unknown, void, unknown>,
  variablesSchema?: z.ZodTypeAny,
) {
  const feed = channel
    .variables(variablesSchema)
    .response<unknown>()
    .implement(handler as never);
  return {
    api: {
      options: { groups: { chat: { options: {}, feed } } },
      feed,
    },
  };
}

async function collect(sub: AsyncIterable<{ data: unknown }>, max = 10): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const ev of sub) {
    out.push(ev.data);
    if (out.length >= max) break;
  }
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("executeDirectWSPush", () => {
  it("throws when source not found", async () => {
    const sources = makePushSources(async function* () {
      yield 1;
    });
    await expect(
      executeDirectWSPush(sources as any, { source: "nope", method: "feed" }),
    ).rejects.toThrow(/failed to resolve/);
  });

  it("throws when endpoint is not WS transport", async () => {
    const httpEndpoint = endpoint.get("/x").response<string>();
    const sources = { api: { options: { groups: {} }, health: httpEndpoint } };
    await expect(
      executeDirectWSPush(sources as any, { source: "api", method: "health" }),
    ).rejects.toThrow(/failed to resolve/);
  });

  it("yields values from the push generator as SSEEvents", async () => {
    const sources = makePushSources(async function* () {
      yield { n: 1 };
      yield { n: 2 };
      yield { n: 3 };
    });
    const sub = await executeDirectWSPush(sources as any, {
      source: "api",
      group: "chat",
      method: "feed",
    });
    expect(await collect(sub)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it("validates variables and rejects on schema mismatch (no stream open)", async () => {
    const onStreamOpen = vi.fn();
    const cleanup = installHooks({ onStreamOpen });

    const sources = makePushSources(
      async function* () {
        yield 1;
      },
      z.object({ id: z.string() }),
    );
    await expect(
      executeDirectWSPush(sources as any, {
        source: "api",
        group: "chat",
        method: "feed",
        variables: { id: 99 },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(onStreamOpen).not.toHaveBeenCalled();
    cleanup();
  });

  it("delivers headers into middleware ctx (verified via middleware mutating headers)", async () => {
    let observed: string | null = null;
    const sources = {
      api: {
        options: {
          middleware: [
            {
              name: "spy",
              phase: "wrap" as const,
              handler: async (ctx: { headers: Headers }, next: () => Promise<unknown>) => {
                observed = ctx.headers.get("authorization");
                return await next();
              },
            },
          ],
          groups: {
            chat: {
              options: {},
              feed: channel
                .variables<unknown>()
                .response<unknown>()
                .implement(async function* () {
                  yield "ok";
                } as never),
            },
          },
        },
      },
    };
    const sub = await executeDirectWSPush(sources as any, {
      source: "api",
      group: "chat",
      method: "feed",
      headers: { authorization: "abc123" },
    });
    await collect(sub);
    expect(observed).toBe("abc123");
  });

  it("emits studio onStreamOpen exactly once with mode=direct,transport=ws", async () => {
    const onStreamOpen = vi.fn();
    const onStreamMessage = vi.fn();
    const onStreamClose = vi.fn();
    const cleanup = installHooks({ onStreamOpen, onStreamMessage, onStreamClose });

    const sources = makePushSources(async function* () {
      yield "a";
      yield "b";
    });
    const sub = await executeDirectWSPush(sources as any, {
      source: "api",
      group: "chat",
      method: "feed",
    });
    await collect(sub);

    const ids = new Set(
      onStreamOpen.mock.calls.map((c) => (c[0] as { requestId: string }).requestId),
    );
    expect(ids.size).toBe(1);
    const last = onStreamOpen.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(last).toMatchObject({ transport: "ws", mode: "direct" });
    expect(onStreamMessage).toHaveBeenCalledTimes(2);
    expect(onStreamClose.mock.calls[0]![0]).toMatchObject({ reason: "complete", eventCount: 2 });
    cleanup();
  });

  it("close() aborts the source generator", async () => {
    let observed = false;
    const sources = makePushSources(async function* () {
      try {
        yield 1;
        await new Promise((r) => setTimeout(r, 100));
        yield 2;
      } finally {
        observed = true;
      }
    });
    const sub = await executeDirectWSPush(sources as any, {
      source: "api",
      group: "chat",
      method: "feed",
    });
    const it = sub[Symbol.asyncIterator]();
    await it.next();
    sub.close();
    await new Promise((r) => setTimeout(r, 10));
    expect(observed).toBe(true);
  });

  it("close() ends a read waiting on a handler parked on an await", async () => {
    const sources = makePushSources(async function* () {
      yield 1;
      await new Promise(() => {});
    });
    const sub = await executeDirectWSPush(sources as any, {
      source: "api",
      group: "chat",
      method: "feed",
    });
    const reading = collect(sub);
    await new Promise((r) => setTimeout(r, 10));

    sub.close();

    await expect(reading).resolves.toEqual([1]);
  });

  it("close() lets a parked handler that watches its signal release what it holds", async () => {
    let released = false;
    const sources = makePushSources(async function* (ctx) {
      try {
        yield 1;
        await new Promise((resolve) => ctx.signal.addEventListener("abort", resolve));
      } finally {
        released = true;
      }
    });
    const sub = await executeDirectWSPush(sources as any, {
      source: "api",
      group: "chat",
      method: "feed",
    });
    const reading = collect(sub);
    await new Promise((r) => setTimeout(r, 10));

    sub.close();
    await reading;
    await new Promise((r) => setTimeout(r, 10));

    expect(released).toBe(true);
  });
});

describe("executeDirectWSPush — response schema", () => {
  function checkedSources(handler: (ctx: WSContext) => AsyncGenerator<unknown, void, unknown>) {
    const feed = channel
      .response(z.object({ n: z.number(), unit: z.string().default("ms") }))
      .implement(handler as never);
    return { api: { options: { groups: { chat: { options: {}, feed } } }, feed } };
  }

  it("hands over each value as the schema produces it", async () => {
    const sources = checkedSources(async function* () {
      yield { n: 1 };
    });

    const sub = await executeDirectWSPush(sources, {
      source: "api",
      group: "chat",
      method: "feed",
    });

    expect(await collect(sub)).toEqual([{ n: 1, unit: "ms" }]);
  });

  it("fails at the first value that does not match, with the schema's issues", async () => {
    const sources = checkedSources(async function* () {
      yield { n: "not-a-number" };
    });

    const sub = await executeDirectWSPush(sources, {
      source: "api",
      group: "chat",
      method: "feed",
    });
    const failure = await collect(sub).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RealtimeValidationError);
    expect((failure as RealtimeValidationError).issues.length).toBeGreaterThan(0);
  });
});
