/**
 * Streams and channels served at the path they declare.
 *
 * A direct client builds its URL from the declared path, so the auto mock
 * serves each SSE and WS endpoint there, not at its name: a
 * `stream.get("stream")` named `ticker` is requested at `/live/stream`, and a
 * channel connects to `ws-room`. A query the path writes is sent as written,
 * so the endpoint is routed by the path before it, and answers only a request
 * that carries the query's values.
 */
import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { analyzeRoutes } from "../src/auto/route-analyzer";

const { stream, channel } = courier();

const Tick = z.object({ n: z.number() });
const Text = z.object({ text: z.string() });

function liveApi(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      live: defineGroup({
        prefix: "live",
        endpoints: {
          ticker: stream.response(Tick).get("stream"),
          events: stream.variables<{ room: string }>().response(Tick).get(":room/events"),
          room: channel.response(Text).send(Text).connect("ws-room"),
        },
      }),
    },
  });
}

const running: Array<{ stop(): Promise<void> }> = [];
afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

async function serve(): Promise<string> {
  const server = createAutoMockServer({
    source: liveApi("http://placeholder.invalid"),
    port: 0,
    log: false,
    overrides: (mock) => {
      mock("live", "ticker").emits([{ data: { n: 1 } }, { data: { n: 2 } }]);
      mock("live", "events").stream(async function* (ctx) {
        const { room } = ctx.variables as { room: string };
        yield { data: { n: room.length } };
      });
      mock("live", "room").channel(() => ({
        onMessage(ctx, msg) {
          ctx.send({ text: `echo:${(msg as { text: string }).text}` });
        },
      }));
    },
  });
  running.push(server);
  return (await server.start()).url;
}

async function collect<TData>(subscription: AsyncIterable<{ data: TData }>): Promise<TData[]> {
  const received: TData[] = [];
  for await (const event of subscription) received.push(event.data);
  return received;
}

describe("declared realtime paths", () => {
  it("analyzes streams and channels at their declared path", () => {
    const routes = analyzeRoutes(liveApi("http://placeholder.invalid"));
    const fullPath = (name: string) => routes.find((r) => r.endpoint === name)?.fullPath;
    expect(fullPath("ticker")).toBe("/live/stream");
    expect(fullPath("events")).toBe("/live/:room/events");
    expect(fullPath("room")).toBe("/live/ws-room");
  });

  it("serves a stream where a direct client requests it", async () => {
    const url = await serve();
    const client = createCaller(liveApi(url));
    expect(await collect(client.live.ticker())).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("fills a stream's path parameters into its variables", async () => {
    const url = await serve();
    const client = createCaller(liveApi(url));
    expect(await collect(client.live.events({ room: "lobby" }))).toEqual([{ n: 5 }]);
  });

  it("no longer answers a stream at its name", async () => {
    const url = await serve();
    expect((await fetch(`${url}/live/ticker`)).status).toBe(404);
  });

  it("accepts a channel where a direct client connects", async () => {
    const url = await serve();
    const client = createCaller(liveApi(url));
    const room = client.live.room();
    const echoed = new Promise<unknown>((resolve, reject) => {
      room.on("data", resolve);
      room.on("error", reject);
    });
    room.send({ text: "hi" });
    expect(await echoed).toEqual({ text: "echo:hi" });
    room.close();
  });
});

/* A stream and a channel whose paths write a query, each after a twin at the same path that writes none. */
function queriedApi(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      live: defineGroup({
        prefix: "live",
        endpoints: {
          events: stream.variables<{ room: string }>().response(Tick).get(":room/events"),
          replay: stream
            .variables<{ room: string }>()
            .response(Tick)
            .get(":room/events?since=:start"),
          room: channel.response(Text).send(Text).connect("ws-room"),
          beta: channel.response(Text).send(Text).connect("ws-room?v=:x"),
        },
      }),
    },
  });
}

async function serveQueried(seen: unknown[]): Promise<string> {
  const echo = (name: string) => () => ({
    onMessage(ctx: { send(data: unknown): void }, msg: unknown) {
      ctx.send({ text: `${name}:${(msg as { text: string }).text}` });
    },
  });
  const server = createAutoMockServer({
    source: queriedApi("http://placeholder.invalid"),
    port: 0,
    log: false,
    overrides: (mock) => {
      mock("live", "events").emits([{ data: { n: 1 } }]);
      mock("live", "replay").stream(async function* (ctx) {
        seen.push(ctx.variables);
        yield { data: { n: 2 } };
      });
      mock("live", "room").channel(echo("room"));
      mock("live", "beta").channel((ctx) => {
        seen.push(ctx.variables);
        return echo("beta")();
      });
    },
  });
  running.push(server);
  return (await server.start()).url;
}

async function echoed(subscription: {
  on(event: "data" | "error", listener: (value: unknown) => void): void;
  send(data: { text: string }): void;
  close(): void;
}): Promise<unknown> {
  const answer = new Promise<unknown>((resolve, reject) => {
    subscription.on("data", resolve);
    subscription.on("error", reject);
  });
  subscription.send({ text: "hi" });
  try {
    return await answer;
  } finally {
    subscription.close();
  }
}

describe("a realtime path that writes a query", () => {
  it("is analyzed at the path before the query, its values fixed", () => {
    const routes = analyzeRoutes(queriedApi("http://placeholder.invalid"));

    expect(routes.map((r) => [r.endpoint, r.path, r.fullPath, r.fixedQuery])).toEqual([
      ["events", ":room/events", "/live/:room/events", undefined],
      ["replay", ":room/events", "/live/:room/events?since=:start", { since: ":start" }],
      ["room", "ws-room", "/live/ws-room", undefined],
      ["beta", "ws-room", "/live/ws-room?v=:x", { v: ":x" }],
    ]);
  });

  it("serves the stream where a direct client opens it, its variables without the query's", async () => {
    const seen: unknown[] = [];
    const client = createCaller(queriedApi(await serveQueried(seen)));

    expect(await collect(client.live.replay({ room: "lobby" }))).toEqual([{ n: 2 }]);
    expect(await collect(client.live.events({ room: "lobby" }))).toEqual([{ n: 1 }]);
    expect(seen).toEqual([{ room: "lobby" }]);
  });

  it("connects the channel where a direct client connects, its variables without the query's", async () => {
    const seen: unknown[] = [];
    const client = createCaller(queriedApi(await serveQueried(seen)));

    expect(await echoed(client.live.beta())).toEqual({ text: "beta:hi" });
    expect(await echoed(client.live.room())).toEqual({ text: "room:hi" });
    expect(seen).toEqual([{}]);
  });
});
