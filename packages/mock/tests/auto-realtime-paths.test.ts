/**
 * Streams and channels served at the path they declare.
 *
 * A direct client builds its URL from the declared path, so the auto mock
 * serves each SSE and WS endpoint there, not at its name: a
 * `stream.get("stream")` named `ticker` is requested at `/live/stream`, and a
 * channel connects to `ws-room`.
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
