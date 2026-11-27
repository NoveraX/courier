/**
 * A React Native app, which gives none of a page's signals, passes its own
 * on — the app back in the foreground, the network back — and its
 * connections act on them as a page's do. A channel whose socket the
 * network cut, waiting out a long wait, comes back on another at once when
 * the app is back in the foreground, and within a second when the network
 * is back, missing nothing the room was sent meanwhile; one whose socket is
 * well stays on it, rather than being made again on every return; and a
 * stream waiting to reconnect opens again at once, from its last event.
 */
import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { defineApi } from "../src/define/api";
import { courier } from "../src/define/courier";
import { defineGroup } from "../src/define/group";
import { clearWSConnectionPool } from "../src/realtime/caller-ws";
import { resumeRealtime } from "../src/realtime/resume-signals";
import { subscribeSSE } from "../src/realtime/sse";
import { type AppServer, serveApp } from "./helpers/app-server";
import { asReactNative, forgetSockets, NativeWebSocket } from "./helpers/react-native";
import { type ReceivedRequest, startUpstream, type Upstream } from "./helpers/upstream";

const { channel } = courier();
/* Far longer than a test waits: a connection back before it came back on a signal. */
const LONG_WAIT = { initialMs: 30_000, maxMs: 30_000, jitter: false };
const FIRST = { text: "naïve café — ✓" };
const SECOND = { text: "Grüße 👋" };

let server: AppServer | undefined;
let upstream: Upstream | undefined;

afterEach(async () => {
  clearWSConnectionPool();
  forgetSockets();
  vi.unstubAllGlobals();
  await server?.stop();
  await upstream?.close();
  server = undefined;
  upstream = undefined;
});

/** The room, joined as the app joins it, its socket made again only after a long wait, and what it hears. */
function join(url: string) {
  const api = defineApi({
    name: "api",
    baseURL: url.replace(/^ws:/, "http:"),
    groups: {
      live: defineGroup({
        prefix: "live",
        endpoints: { room: channel.send<string>().response<string>().connect("room") },
      }),
    },
  });
  const room = createCaller(api, { ws: { backoff: LONG_WAIT } }).live.room();
  const heard: string[] = [];
  room.on("data", (message) => heard.push(message));
  return { room, heard };
}

/** A channel whose socket the network cut, waiting out its wait, with what the room was sent meanwhile. */
async function cutOff() {
  server = await serveApp();
  asReactNative("expo");
  const joined = join(server.url);
  await vi.waitFor(() => expect(joined.room.status).toBe("connected"));
  await server.broadcast("first");
  await vi.waitFor(() => expect(joined.heard).toEqual(["first"]));
  NativeWebSocket.made[0]?.cut();
  await vi.waitFor(() => expect(joined.room.status).toBe("reconnecting"));
  await server.broadcast("while away");
  return joined;
}

describe.each([
  ["visible", "back in the foreground", 1000],
  ["online", "told the network is back", 2500],
] as const)("a channel of a React Native app", (signal, when, withinMs) => {
  it(`comes back on another socket at once once the app is ${when}, missing nothing`, async () => {
    const { room, heard } = await cutOff();

    resumeRealtime(signal);

    await vi.waitFor(() => expect(room.status).toBe("connected"), { timeout: withinMs });
    await server?.broadcast("after");
    await vi.waitFor(() => expect(heard).toEqual(["first", "while away", "after"]));
    expect(NativeWebSocket.made).toHaveLength(2);
    room.close();
  });
});

describe("a channel of a React Native app whose socket is well", () => {
  it("stays on it once the app is back in the foreground", async () => {
    server = await serveApp();
    asReactNative("expo");
    const { room, heard } = join(server.url);
    await vi.waitFor(() => expect(room.status).toBe("connected"));

    resumeRealtime("visible");
    await new Promise((resolve) => setTimeout(resolve, 500));
    room.send("still here ✓");

    await vi.waitFor(() => expect(heard).toEqual(["echo still here ✓"]));
    expect(NativeWebSocket.made).toHaveLength(1);
    expect(server.ended).toEqual([]);
    room.close();
  });
});

describe("a stream of a React Native app waiting to reconnect", () => {
  it("opens again at once once the app is back in the foreground, from its last event", async () => {
    upstream = await startUpstream(feed);
    asReactNative("expo");
    const events: unknown[] = [];
    const stream = subscribeSSE(`${upstream.url}/feed`, { backoff: LONG_WAIT });
    stream.on("data", (data) => events.push(data));
    await vi.waitFor(() => expect(stream.status).toBe("reconnecting"));

    resumeRealtime("visible");

    await vi.waitFor(() => expect(events).toEqual([FIRST, SECOND]), { timeout: 1000 });
    expect(upstream.received.map((request) => request.headers["last-event-id"])).toEqual([
      undefined,
      "1",
    ]);
    stream.close();
  });
});

/* The first connection sends one event and ends, as a stream cut on its way does; the next, the one after it. */
function feed(request: ReceivedRequest, res: ServerResponse): void {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
  if (request.headers["last-event-id"] === undefined) {
    res.end(`id: 1\ndata: ${JSON.stringify(FIRST)}\n\n`);
  } else {
    res.write(`id: 2\ndata: ${JSON.stringify(SECOND)}\n\n`);
  }
}
