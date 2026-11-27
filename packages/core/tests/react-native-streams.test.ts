/**
 * A stream of server-sent events in a React Native app. Under expo/fetch,
 * which hands an answer over as it comes, the app's subscription reads each
 * event as it is sent, its text as it was, while the stream stays open.
 * Under React Native's own fetch, which hands an answer over only once all
 * of it has arrived — a stream's, never — it is refused before anything is
 * sent, with Expo and without, through a direct caller, through the app's
 * server's proxy and opened with `subscribeSSE`, as a call that reads its
 * answer as it comes is refused. Through a fetch of the app's own that sends
 * with React Native's, which shows itself only in what it hands over, it is
 * refused once the first answer comes, whatever that answer says, rather
 * than reconnecting again and again.
 */
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import type { SourceFetch } from "../src/http-client/source-transport";
import { createProxyCaller } from "../src/proxy-caller";
import { subscribeSSE } from "../src/realtime/sse";
import type { Subscription } from "../src/realtime/subscription-types";
import { within } from "./helpers/endless-body";
import { asReactNative } from "./helpers/react-native";
import { type ReceivedRequest, startUpstream, type Upstream } from "./helpers/upstream";

const { stream } = courier();
const FIRST = { text: "naïve café in Zürich — ½ off ✓ 🚀" };
const SECOND = { text: "Grüße — ✓ 👋" };
/* Longer than an answer takes here, shorter than the 15 s a connection has to open. */
const WAIT_MS = 2000;

let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream(answer);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await upstream.close();
});

function answer(request: ReceivedRequest, res: ServerResponse): void {
  /* A stream through the proxy carries its call in the query. */
  switch (request.url.split("?")[0]) {
    case "/feed":
    case "/sse":
      /* Open for as long as the app reads it, as a stream of updates is. */
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
      res.write(`id: 1\ndata: ${JSON.stringify(FIRST)}\n\n`);
      return;
    case "/ending-feed":
      /* Two events, then the end a Courier server says a stream's handler returned with. */
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        `id: 1\ndata: ${JSON.stringify(FIRST)}\n\nid: 2\ndata: ${JSON.stringify(SECOND)}\n\n` +
          "event: courier:complete\ndata: null\n\n",
      );
      return;
    case "/refused-feed": {
      const said = Buffer.from(JSON.stringify({ message: "Token expired — café ✓" }));
      res.writeHead(401, { "content-type": "application/json", "content-length": said.length });
      res.end(said);
      return;
    }
    default:
      res.writeHead(404).end();
  }
}

function api(options: { fetch?: SourceFetch } = {}) {
  return defineApi({
    baseURL: upstream.url,
    ...options,
    endpoints: {
      feed: stream.response<typeof FIRST>().get("feed"),
      endingFeed: stream.response<typeof FIRST>().get("ending-feed"),
      refusedFeed: stream.response<typeof FIRST>().get("refused-feed"),
    },
  });
}

/* The app's streams through its server's proxy. */
function proxied() {
  const source = defineApi({
    expose: true,
    name: "shop",
    baseURL: upstream.url,
    endpoints: { feed: stream.response<typeof FIRST>().get("feed") },
  });
  return createProxyCaller(routesOf(source, "shop"), {
    proxyPath: { sse: `${upstream.url}/sse` },
  });
}

/* An app's own fetch, one that signs each request and sends it with the app's. */
const signed: SourceFetch = (url, init) => {
  const headers = new Headers((init as RequestInit).headers);
  headers.set("x-signature", "signed");
  return globalThis.fetch(url, { ...init, headers });
};

/* What a stream that cannot be read as it comes is refused with. */
const UNSTREAMED = {
  error: expect.objectContaining({
    name: "ConfigurationError",
    code: "RESPONSE_STREAM_UNAVAILABLE",
    message: expect.stringContaining("server-sent events"),
  }),
};

/* How reading the subscription ends, if it ends in time: the events it read, or what it rejected with. */
async function ending(subscription: Subscription<unknown>): Promise<unknown> {
  const read = (async () => {
    const events: unknown[] = [];
    for await (const event of subscription) events.push(event.data);
    return { events };
  })();
  try {
    return await within(read, WAIT_MS);
  } catch (error) {
    return { error };
  } finally {
    subscription.close();
  }
}

describe.each(["react-native", "expo-with-react-native-fetch"] as const)(
  "a stream in an app whose fetch is %s's",
  (fetch) => {
    it("is refused before anything is sent, as that fetch hands an answer over only once all of it has arrived", async () => {
      asReactNative(fetch);

      const feed = createCaller(api()).feed();

      expect(await ending(feed)).toEqual(UNSTREAMED);
      expect(upstream.received).toEqual([]);
    });

    it("is refused before anything is sent through the app's server's proxy", async () => {
      asReactNative(fetch);

      const feed = proxied().feed();

      expect(await ending(feed)).toEqual(UNSTREAMED);
      expect(upstream.received).toEqual([]);
    });

    it("is refused as it is opened with subscribeSSE", () => {
      asReactNative(fetch);

      const opening = () => subscribeSSE(`${upstream.url}/feed`);

      expect(opening).toThrow(UNSTREAMED.error);
      expect(upstream.received).toEqual([]);
    });

    it("is refused once its answer is handed over, through the app's own fetch, which sends with that one", async () => {
      asReactNative(fetch);

      const feed = createCaller(api({ fetch: signed })).endingFeed();

      expect(await ending(feed)).toEqual(UNSTREAMED);
      expect(upstream.received).toHaveLength(1);
      expect(upstream.received[0]?.headers["x-signature"]).toBe("signed");
    });

    it("is refused so through the app's own fetch whatever the answer says, a refusal too", async () => {
      asReactNative(fetch);

      const feed = createCaller(api({ fetch: signed })).refusedFeed();

      expect(await ending(feed)).toEqual(UNSTREAMED);
      expect(upstream.received).toHaveLength(1);
    });
  },
);

describe("a stream in an app whose fetch is expo's", () => {
  it("reads each event as it is sent, its text as it was, while the stream stays open", async () => {
    asReactNative("expo");
    const feed = createCaller(api()).feed();
    const heard: unknown[] = [];
    feed.on("data", (data) => heard.push(data));

    await vi.waitFor(() => expect(heard).toEqual([FIRST]));

    expect(feed.status).toBe("connected");
    feed.close();
  });

  it("reads a stream the server ends to its end", async () => {
    asReactNative("expo");

    const feed = createCaller(api()).endingFeed();

    expect(await ending(feed)).toEqual({ events: [FIRST, SECOND] });
  });
});
