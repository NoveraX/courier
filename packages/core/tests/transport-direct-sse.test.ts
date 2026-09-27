/**
 * Where a direct caller opens a remote stream: the group's prefix, then the
 * path the endpoint addressed, worked out from each call's variables.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { RealtimeValidationError } from "../src/realtime/errors";

const { stream } = courier();

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

/** A remote SSE server that answers every request with its own URL. */
async function echoServer(): Promise<string> {
  server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(`data: ${JSON.stringify(req.url)}\n\n`);
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function remoteApi(baseURL: string) {
  return defineApi({
    name: "api",
    baseURL: `${baseURL}/direct`,
    groups: {
      rooms: defineGroup({
        prefix: "rooms",
        endpoints: {
          events: stream
            .variables<{ room: string; since?: number }>()
            .response<string>()
            .get(":room/events"),
          feed: stream
            .variables<{ room: string }>()
            .response<string>()
            .via((sse, v) => sse.get(`${v.room}/feed`)),
          named: stream.variables<{ since: number }>().response<string>().get(),
        },
      }),
    },
  });
}

/** The URL the server saw for the first event of a subscription. */
async function requestedUrl(subscription: AsyncIterable<{ data: string }>): Promise<string> {
  for await (const event of subscription) return event.data;
  throw new Error("The stream ended without an event");
}

describe("a direct stream call", () => {
  it("fills a path parameter from the call's variables", async () => {
    const caller = createCaller(remoteApi(await echoServer()));

    const url = await requestedUrl(caller.rooms.events({ room: "lobby", since: 3 }));

    expect(url).toBe("/direct/rooms/lobby/events?since=3");
  });

  it("follows the path a closure builds from the call's variables", async () => {
    const caller = createCaller(remoteApi(await echoServer()));

    const url = await requestedUrl(caller.rooms.feed({ room: "lobby" }));

    expect(url).toBe("/direct/rooms/lobby/feed");
  });

  it("addresses a stream with no path by its name, with its variables in the query", async () => {
    const caller = createCaller(remoteApi(await echoServer()));

    const url = await requestedUrl(caller.rooms.named({ since: 7 }));

    expect(url).toBe("/direct/rooms/named?since=7");
  });

  it("refuses a call whose variables leave a path parameter empty", async () => {
    const caller = createCaller(remoteApi(await echoServer()));

    expect(() => caller.rooms.events({ since: 3 } as never)).toThrow(RealtimeValidationError);
    expect(() => caller.rooms.events({ since: 3 } as never)).toThrow(
      "Missing required parameter: room",
    );
  });
});
