/**
 * The SSE registry on the selectors the WebSocket one takes: `list()` of
 * this replica's streams a selector names and `broadcastToMeta()` by
 * fields, both through an index of each stream's metadata — a copy taken
 * as it opened — and `disconnect()` of the streams a selector names on
 * every replica sharing the handler's pub/sub adapter, its command signed
 * with the cluster's secret when there is one. An ended stream says
 * nothing of why, so its client comes back as from a dropped one, and
 * passes `onSSEConnect` again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import type { HandlerConfig } from "../src/adapter/handler-config";
import { courier } from "../src/define/courier";
import type { PubSubAdapter } from "../src/realtime/adapters";
import { createMemoryBus } from "../src/realtime/memory-bus";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";

const SECRET = "a-cluster-secret-of-32-bytes-or-more";
const SSE_CONTROL = "courier:sse:control";

const { stream } = courier();
const feed = stream.response<string>().implement(async function* (ctx) {
  yield { data: "hello" };
  await new Promise((resolve) => ctx.signal.addEventListener("abort", resolve));
});

const handlers: Array<ReturnType<typeof createHandler>> = [];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  registerSources({ api: { options: { expose: true }, feed } } as never);
});

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.shutdownSSE({ drainMs: 0 })));
  _resetSourcesForTests();
  vi.restoreAllMocks();
});

function serve(config: HandlerConfig = {}) {
  const handler = createHandler({
    onSSEConnect: ({ request }) => ({
      userId: request.headers.get("x-user"),
      role: request.headers.get("x-role") ?? "member",
    }),
    ...config,
  });
  handlers.push(handler);
  return handler;
}

/** A stream of `userId` on `handler`, read up to its first event; what else it sends, once it ends. */
async function open(handler: ReturnType<typeof serve>, userId: string, role?: string) {
  const headers: Record<string, string> = { accept: "text/event-stream", "x-user": userId };
  if (role) headers["x-role"] = role;
  const response = await handler.handleSSE(
    new Request("http://app.localhost/api/sse?_s=api&_m=feed", { headers }),
  );
  const reader = response.body?.getReader();
  await reader?.read();
  const decoder = new TextDecoder();
  const rest = (async () => {
    let text = "";
    for (;;) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) return text;
      text += decoder.decode(chunk.value);
    }
  })();
  return { rest };
}

const usersOf = (
  handler: ReturnType<typeof serve>,
  selector?: Parameters<typeof handler.sseConnections.list>[0],
) =>
  handler.sseConnections
    .list(selector)
    .map((info) => info.meta.userId)
    .sort();

describe("the SSE registry's selectors", () => {
  it("list this replica's streams a selector names, each with a copy of its metadata", async () => {
    const handler = serve();
    for (const userId of ["u1", "u1", "u2"]) await open(handler, userId);
    const [first] = handler.sseConnections.list();

    expect(usersOf(handler, { meta: { userId: "u1" } })).toEqual(["u1", "u1"]);
    expect(usersOf(handler, first?.connectionId)).toEqual([first?.meta.userId]);
    expect(usersOf(handler, { id: ["missing"] })).toEqual([]);
    (first?.meta as Record<string, unknown>).userId = "changed";
    expect(usersOf(handler)).toEqual(["u1", "u1", "u2"]);
    expect(() => handler.sseConnections.list({ meta: {} })).toThrow(TypeError);
  });

  it("send broadcastToMeta to the streams whose metadata has every field given", async () => {
    const handler = serve();
    await open(handler, "u1", "admin");
    await open(handler, "u2", "admin");
    await open(handler, "u1");
    const admins = handler.sseConnections.list({ meta: { role: "admin", userId: "u1" } });

    const sent = handler.sseConnections.broadcastToMeta(
      { role: "admin", userId: "u1" },
      { data: "to u1's admin stream" },
    );

    expect([...sent.keys()]).toEqual(admins.map((info) => info.connectionId));
    expect(() => handler.sseConnections.broadcastToMeta({}, { data: "none" })).toThrow(TypeError);
  });

  it("disconnect the streams a selector names on every replica, saying nothing of why", async () => {
    const bus = createMemoryBus();
    const [a, b] = [serve({ pubsub: bus.replica("a") }), serve({ pubsub: bus.replica("b") })];
    const onA = await open(a, "u1");
    const onB = await open(b, "u1");
    await open(b, "u2");

    await a.sseConnections.disconnect({ meta: { userId: "u1" } });

    await expect.poll(() => usersOf(b)).toEqual(["u2"]);
    expect(usersOf(a)).toEqual([]);
    for (const ended of [onA, onB]) expect(await ended.rest).not.toContain("courier:");
  });

  it("send the others no command when every id named is this replica's", async () => {
    const bus = createMemoryBus();
    const pubsub = bus.replica("a");
    const publish = vi.spyOn(pubsub, "publish");
    const a = serve({ pubsub });
    await open(a, "u1");
    const [held] = a.sseConnections.list();

    await a.sseConnections.disconnect({ id: [held?.connectionId ?? ""] });

    await expect.poll(() => a.sseConnections.count).toBe(0);
    expect(publish.mock.calls.filter(([channel]) => channel === SSE_CONTROL)).toEqual([]);
  });

  it("refuse, with a cluster secret, a command published straight to the adapter", async () => {
    const bus = createMemoryBus();
    const cluster = { secret: SECRET };
    const a = serve({ pubsub: bus.replica("a"), cluster });
    const b = serve({ pubsub: bus.replica("b"), cluster });
    await open(b, "u1");
    const intruder: PubSubAdapter = bus.replica("intruder");
    const cmd = {
      kind: "disconnect",
      selector: { meta: { userId: "u1" } },
      code: 1000,
      reason: "x",
    };

    await intruder.publish(SSE_CONTROL, { v: 1, id: "forged-1", at: Date.now(), cmd });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(usersOf(b)).toEqual(["u1"]);

    await a.sseConnections.disconnect({ meta: { userId: "u1" } });
    await expect.poll(() => usersOf(b)).toEqual([]);
  });

  it("reject with a TypeError, ending none, a selector that names no connection", async () => {
    const handler = serve({ pubsub: createMemoryBus().replica("a") });
    await open(handler, "u1");

    await expect(handler.sseConnections.disconnect({ meta: {} })).rejects.toThrow(TypeError);
    expect(handler.sseConnections.count).toBe(1);
  });

  it("stop hearing the other replicas once the streams are shut down", async () => {
    const pubsub = createMemoryBus().replica("a");
    const handler = serve({ pubsub });
    expect(pubsub.stats().channels.wanted).toBe(1);

    await handler.shutdownSSE({ drainMs: 0 });

    expect(pubsub.stats().channels.wanted).toBe(0);
  });
});
