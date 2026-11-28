/**
 * Records and promises an app takes from Node where a test runs in a context
 * of its own, as Jest runs each file: what Node's `Response.json()` reads is
 * of Node's realm, its `Object.prototype` not the context's, and the promise
 * it gives is no instance of the context's `Promise`. A record is told by
 * its prototype being the root of its chain, in any realm, and a promise by
 * its `then`, as `await` tells one.
 */
import type { ServerResponse } from "node:http";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { courier, defineApi } from "../../src/define/index";
import type { WSCredentials } from "../../src/realtime/ws/ws-credentials";
import { executeWSChannel } from "../../src/realtime/ws-channel-client";
import { isPlainRecord } from "../../src/utils/is-plain-record";
import { type ReceivedRequest, startUpstream, type Upstream } from "../helpers/upstream";
import { type ServedWS, serveWS, stopWS } from "../helpers/ws-server";

const { endpoint, channel } = courier();

let upstream: Upstream;
let served: ServedWS | undefined;

beforeEach(async () => {
  upstream = await startUpstream(answer);
});

afterEach(async () => {
  await upstream.close();
  await stopWS(served);
  served = undefined;
});

function answer(request: ReceivedRequest, res: ServerResponse): void {
  const body = JSON.stringify({ url: request.url });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(body);
}

function api() {
  return createCaller(
    defineApi({
      baseURL: upstream.url,
      endpoints: {
        news: endpoint
          .get("news")
          .variables<{ group: string; groupBy?: string }>()
          .defaults({ groupBy: "year" }),
        search: endpoint.get("search").variables<{ filter: Record<string, unknown> }>(),
      },
    }),
  );
}

/* What Node's `Response.json()` reads of `text`. */
function nodeJson<T>(text: string): Promise<T> {
  return new Response(text).json() as Promise<T>;
}

it("runs where Node's records and promises are of another realm", async () => {
  const pending = nodeJson<object>("{}");

  expect(pending instanceof Promise).toBe(false);
  expect(Object.getPrototypeOf(await pending) === Object.prototype).toBe(false);
});

describe("a record", () => {
  it("is told by its prototype being the root of its chain, whichever realm made it", () => {
    expect(isPlainRecord(runInNewContext("({ role: 'admin' })"))).toBe(true);
    expect(isPlainRecord(runInNewContext("Object.create(null)"))).toBe(true);
    expect(isPlainRecord(runInNewContext("new Date()"))).toBe(false);
    expect(isPlainRecord(runInNewContext("[]"))).toBe(false);
  });
});

describe("a call given variables Node's Response.json() read", () => {
  it("fills in its endpoint's defaults", async () => {
    const variables = await nodeJson<{ group: string }>('{"group":"press"}');

    await expect(api().news(variables)).resolves.toEqual({ url: "/news?group=press&groupBy=year" });
  });

  it("spreads a record among them into keys of the query", async () => {
    const filter = await nodeJson<Record<string, unknown>>('{"role":"admin","page":2}');

    await expect(api().search({ filter })).resolves.toEqual({ url: "/search?role=admin&page=2" });
  });
});

describe("a socket whose credentials a promise of Node's gives", () => {
  const room = channel
    .send<string>()
    .response<string>()
    .implement(() => ({ onJoin: (ctx) => ctx.send("welcome"), onMessage() {} }));

  it("opens with them", async () => {
    const seen: unknown[] = [];
    served = await serveWS(
      { room },
      {
        onConnect: ({ auth }) => {
          seen.push(auth);
          return {};
        },
      },
    );
    const credentials = () => nodeJson<WSCredentials>('{"frame":{"auth":{"tenant":"acme"}}}');

    const ch = executeWSChannel<string, string>(served.url, "api.live.room", undefined, {
      credentials,
    });
    const heard: string[] = [];
    ch.on("data", (data) => heard.push(data));

    await vi.waitFor(() => expect(heard).toEqual(["welcome"]));
    expect(seen).toEqual([{ tenant: "acme" }]);
    ch.close();
  });
});
