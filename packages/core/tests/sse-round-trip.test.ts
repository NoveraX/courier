/**
 * A stream endpoint read back through the Courier SSE client, end to end:
 * the real handler answers the client's own requests.
 *
 * String data arrives as it was sent — "hello" as itself, "42" as a string —
 * a stream the server finishes ends rather than replaying from the start, a
 * failed one ends with its error rather than an ordinary event, and leaving a
 * `for await` closes the connection.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createHandler } from "../src/adapter";
import { courier } from "../src/define/courier";
import { executeSSE } from "../src/realtime/caller-sse";
import { ForbiddenError, RealtimeError, RealtimeValidationError } from "../src/realtime/errors";
import { buildProxySSEUrl } from "../src/realtime/sse-address";
import type { SSEContext, SSEEvent } from "../src/realtime/types";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { stream } = courier();

afterEach(() => {
  _resetSourcesForTests();
  vi.unstubAllGlobals();
});

type Handler = (ctx: SSEContext) => AsyncGenerator<SSEEvent<unknown>, void, unknown>;

let requests = 0;

/** Serve `handler` as `api.live.feed` and route the client's fetches to it. */
function serve(handler: Handler, variables?: Record<string, unknown>): string {
  const feed = stream
    .variables(z.object({ room: z.string().optional() }))
    .response<unknown>()
    .implement(handler as never);
  registerSources({ api: { options: { groups: { live: { options: {}, feed } } } } } as never);
  const { handleSSE } = createHandler();
  requests = 0;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    requests += 1;
    return handleSSE(new Request(url, init));
  });
  return buildProxySSEUrl("http://localhost/api/sse", "api", "live", "feed", variables);
}

async function readAll(url: string): Promise<unknown[]> {
  const seen: unknown[] = [];
  for await (const event of executeSSE<unknown>(url)) seen.push(event.data);
  return seen;
}

async function readFor(url: string, ms: number): Promise<unknown[]> {
  const sub = executeSSE<unknown>(url);
  const seen: unknown[] = [];
  const reading = (async () => {
    for await (const event of sub) seen.push(event.data);
  })();
  await Promise.race([reading, new Promise((resolve) => setTimeout(resolve, ms))]);
  sub.close();
  return seen;
}

describe("data sent by a stream endpoint", () => {
  it("arrives in a runtime without ByteLengthQueuingStrategy, as the Edge Runtime is", async () => {
    vi.stubGlobal("ByteLengthQueuingStrategy", undefined);
    const url = serve(async function* () {
      yield { data: "first" };
      yield { data: "second" };
    });

    expect(await readAll(url)).toEqual(["first", "second"]);
  });

  it("arrives as sent, strings included", async () => {
    const sent = ["hello", "42", "true", "line one\nline two", 7, { a: [1, null] }, null];
    const url = serve(async function* () {
      for (const data of sent) yield { data };
    });

    const seen = await readFor(url, 50);

    expect(seen.slice(0, sent.length)).toEqual(sent);
  });
});

describe("a stream the server finished", () => {
  it("ends on the client without being replayed", async () => {
    const url = serve(async function* () {
      yield { data: 1 };
      yield { data: 2 };
    });

    await expect(readAll(url)).resolves.toEqual([1, 2]);
    expect(requests).toBe(1);
  });
});

describe("a stream the server failed", () => {
  it("rejects with the RealtimeError the handler threw, after what came before", async () => {
    const seen: unknown[] = [];
    const url = serve(async function* () {
      yield { data: "before" };
      throw new ForbiddenError("Not a member of this room");
    });

    const reading = (async () => {
      for await (const event of executeSSE<unknown>(url)) seen.push(event.data);
    })();

    await expect(reading).rejects.toThrow(ForbiddenError);
    await expect(reading).rejects.toThrow("Not a member of this room");
    expect(seen).toEqual(["before"]);
    expect(requests).toBe(1);
  });

  it("rejects with a generic RealtimeError for any other error", async () => {
    const url = serve(async function* () {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
    });

    const failure = await readAll(url).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RealtimeError);
    expect(failure).toMatchObject({ code: 5000, message: "Stream failed" });
  });
});

describe("a stream the server refused", () => {
  it("rejects without reconnecting when the variables are invalid", async () => {
    const url = serve(
      async function* () {
        yield { data: "never" };
      },
      { room: 42 },
    );

    await expect(readAll(url)).rejects.toBeInstanceOf(RealtimeValidationError);
    expect(requests).toBe(1);
  });

  it("rejects with the schema's issues, as a WebSocket refusal carries them", async () => {
    const url = serve(
      async function* () {
        yield { data: "never" };
      },
      { room: 42 },
    );

    const failure = await readAll(url).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RealtimeValidationError);
    expect((failure as RealtimeValidationError).issues).toEqual([
      expect.objectContaining({ path: ["room"] }),
    ]);
  });
});

describe("leaving a for await early", () => {
  it("closes the stream on the server", async () => {
    let serverSignal: AbortSignal | undefined;
    const url = serve(async function* (ctx) {
      serverSignal = ctx.signal;
      yield { data: 1 };
      await new Promise((resolve) => ctx.signal.addEventListener("abort", resolve));
    });

    for await (const _event of executeSSE<unknown>(url)) break;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(serverSignal?.aborted).toBe(true);
    expect(requests).toBe(1);
  });
});

describe("a stream with a response schema", () => {
  function serveChecked(handler: Handler): string {
    const feed = stream
      .response(z.object({ n: z.number(), unit: z.string().default("ms") }))
      .implement(handler as never);
    registerSources({ api: { options: { groups: { live: { options: {}, feed } } } } } as never);
    const { handleSSE } = createHandler();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => handleSSE(new Request(url, init)));
    return buildProxySSEUrl("http://localhost/api/sse", "api", "live", "feed");
  }

  it("sends each event as the schema produces it", async () => {
    const url = serveChecked(async function* () {
      yield { data: { n: 1 } };
      yield { data: { n: 2, unit: "s" } };
    });

    await expect(readAll(url)).resolves.toEqual([
      { n: 1, unit: "ms" },
      { n: 2, unit: "s" },
    ]);
  });

  it("fails the stream with the schema's issues at the first event that does not match", async () => {
    const seen: unknown[] = [];
    const url = serveChecked(async function* () {
      yield { data: { n: 1 } };
      yield { data: { n: "not-a-number" } };
      yield { data: { n: 3 } };
    });

    const reading = (async () => {
      for await (const event of executeSSE<unknown>(url)) seen.push(event.data);
    })();
    const failure = await reading.catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RealtimeValidationError);
    expect(failure).toMatchObject({ code: 4422 });
    expect((failure as RealtimeValidationError).issues).toEqual([
      expect.objectContaining({ path: ["n"] }),
    ]);
    expect(seen).toEqual([{ n: 1, unit: "ms" }]);
  });
});
