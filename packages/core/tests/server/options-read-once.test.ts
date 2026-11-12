/**
 * A call reads its API's options once, as it is resolved, and every place
 * on its way takes what a server checked and holds of that read: the
 * request's headers the call forwards beside the session, what its answer
 * hands the browser — the upstream's headers and the cookies it set — and
 * where a stream opens with the session. Options put in their place while
 * the call is on its way are the next call's. A call that takes options no
 * server checked yet has them checked before it reads any of them, so a
 * list that answers its first read otherwise than the next sends what the
 * check read.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../../src/adapter";
import { createCaller } from "../../src/caller";
import { courier, defineApi } from "../../src/define";
import { routesOf } from "../../src/define/routes-of";
import { createProxyCaller } from "../../src/proxy-caller";
import { registerRequestContext } from "../../src/server/session/request-context";
import { _resetSourcesForTests, registerSources } from "../../src/server/sources";
import type { IncomingRequest } from "../../src/session/incoming-request";
import { asBrowserPage } from "../helpers/browser-page";

const { endpoint, stream } = courier();
const UPSTREAM = "https://upstream.example";
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  for (const close of closers.splice(0).reverse()) await close();
});

function accountsApi() {
  return defineApi({
    expose: true,
    name: "accounts",
    baseURL: UPSTREAM,
    session: { cookies: ["sid"] },
    allowedHeaders: ["x-api-version"],
    endpoints: { me: endpoint.get("me") },
  });
}

/* Options of the API's own put in their place, as a hot reload or a test might. */
function putInPlace(api: { options: object }, options: object): void {
  Object.assign(api, { options });
}

/* Its options again, with a header list that names the browser's cookie to its first read alone. */
function cookieFirst(api: { options: object }): object {
  let reads = 0;
  const options = { ...api.options };
  Object.defineProperty(options, "allowedHeaders", {
    configurable: true,
    enumerable: true,
    get: () => {
      reads += 1;
      return reads === 1 ? ["cookie"] : ["x-api-version"];
    },
  });
  return options;
}

/* After `ticks` microtasks, `then`. */
function afterMicrotasks(ticks: number, then: () => void): void {
  let left = ticks;
  const spin = () => {
    if (left-- > 0) queueMicrotask(spin);
    else then();
  };
  queueMicrotask(spin);
}

/* A browser's call of `api.me` over the proxy, with a cookie of the browser's own and none of
   the session's; `during` runs as the proxy starts on it. What the upstream was sent, and what
   the browser was answered with. */
async function overTheProxy(api: ReturnType<typeof accountsApi>, during: () => void) {
  const handler = createHandler();
  asBrowserPage();
  const sent: Array<string | null> = [];
  let answered: Response | undefined;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    /* The page's own calls are relative: they go to its origin. */
    const url = new URL(input instanceof Request ? input.url : String(input), "http://app.local");
    if (url.origin === UPSTREAM) {
      sent.push(
        new Headers(input instanceof Request ? input.headers : init?.headers).get("cookie"),
      );
      return Response.json(
        { ok: true },
        {
          headers: { "set-cookie": "upstream_sid=made-up-upstream; Path=/", "x-api-version": "3" },
        },
      );
    }
    const headers = new Headers(init?.headers);
    headers.set("cookie", "other=made-up-other");
    const pending = handler.handle(new Request(url, { ...init, headers }));
    during();
    answered = await pending;
    return answered;
  });
  const client = createProxyCaller(routesOf(api, "accounts")) as unknown as {
    me(): Promise<unknown>;
  };
  const refused = await client.me().then(
    () => false,
    () => true,
  );
  return {
    refused,
    sent,
    setCookies: answered?.headers.getSetCookie() ?? [],
    version: answered?.headers.get("x-api-version") ?? null,
  };
}

describe("a proxy's call of an API that keeps a session", () => {
  it("answers as the options it took let it, whenever others are put in their place on its way", async () => {
    for (let ticks = 0; ticks <= 40; ticks += 1) {
      const api = accountsApi();
      registerSources({ accounts: api });
      const answer = await overTheProxy(api, () =>
        afterMicrotasks(ticks, () =>
          putInPlace(api, { ...api.options, allowedHeaders: ["cookie", "set-cookie"] }),
        ),
      );
      const at = `options put in place after ${ticks} microtasks`;

      expect(answer.sent, at).not.toContain("other=made-up-other");
      expect(answer.setCookies, at).toEqual([]);
      if (answer.refused) expect(answer.sent, at).toEqual([]);
      else expect(answer.version, at).toBe("3");
      vi.unstubAllGlobals();
      _resetSourcesForTests();
    }
  });

  it("has options no server checked yet checked before it reads them, and refused before it sends", async () => {
    const api = accountsApi();
    registerSources({ accounts: api });
    putInPlace(api, cookieFirst(api));

    const answer = await overTheProxy(api, () => undefined);

    expect(answer.refused).toBe(true);
    expect(answer.sent).toEqual([]);
  });
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/* An upstream that answers every stream it is opened for with one event, keeping what each was opened with. */
async function streamUpstream(seen: IncomingHttpHeaders[]): Promise<string> {
  return listen(
    createServer((req, res) => {
      seen.push(req.headers);
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: 1\n\n");
    }),
  );
}

function feedApi(baseURL: string) {
  return defineApi({
    expose: true,
    name: "feed",
    baseURL,
    session: { cookies: ["sid"] },
    endpoints: { live: stream.response<number>().get("live") },
  });
}

/* A stream's answer read up to its first event, and the stream let go. */
async function firstEvent(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  let text = "";
  while (reader !== undefined && !text.includes("data:")) {
    const { done, value } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  await reader?.cancel();
  return text;
}

describe("a stream of an API that keeps a session", () => {
  it("opens where its session was found for when a server opens it, whatever options are put in place before it connects", async () => {
    const found: IncomingHttpHeaders[] = [];
    const elsewhere: IncomingHttpHeaders[] = [];
    const api = feedApi(await streamUpstream(found));
    const other = await streamUpstream(elsewhere);
    const serving: IncomingRequest = {
      key: {},
      method: "GET",
      headers: new Headers({ cookie: "sid=made-up-session" }),
    };
    const remove = registerRequestContext(() => serving);

    const sub = createCaller(api).live();
    putInPlace(api, { ...api.options, baseURL: other });
    remove();
    for await (const _event of sub) break;
    sub.close();

    expect(elsewhere.map((headers) => headers.cookie)).toEqual([]);
    expect(found.map((headers) => headers.cookie)).toEqual(["sid=made-up-session"]);
  });

  it("is relayed where its session was found for, whatever options are put in place as it connects", async () => {
    const found: IncomingHttpHeaders[] = [];
    const elsewhere: IncomingHttpHeaders[] = [];
    const api = feedApi(await streamUpstream(found));
    const other = await streamUpstream(elsewhere);
    const handler = createHandler({
      sources: { feed: api },
      onSSEConnect: () => {
        putInPlace(api, { ...api.options, baseURL: other });
      },
    });

    const response = await handler.handle(
      new Request("http://localhost/api/sse?_s=feed&_m=live", {
        headers: { accept: "text/event-stream", cookie: "sid=made-up-session" },
      }),
    );
    expect(await firstEvent(response)).toContain("data: 1");

    expect(elsewhere.map((headers) => headers.cookie)).toEqual([]);
    expect(found.map((headers) => headers.cookie)).toEqual(["sid=made-up-session"]);
  });

  it("served, has options no server checked yet checked before it reads them, and is refused before it opens", async () => {
    const heard: Array<string | null> = [];
    const api = defineApi({
      expose: true,
      name: "feed",
      baseURL: UPSTREAM,
      session: { cookies: ["sid"] },
      allowedHeaders: ["x-api-version"],
      endpoints: {
        live: stream.response<number>().implement(async function* (ctx) {
          heard.push(ctx.headers.get("cookie"));
          yield { data: 1 };
        }),
      },
    });
    const handler = createHandler({ sources: { feed: api } });
    putInPlace(api, cookieFirst(api));

    const response = await handler.handle(
      new Request("http://localhost/api/sse?_s=feed&_m=live", {
        headers: { accept: "text/event-stream", cookie: "other=made-up-other" },
      }),
    );

    expect(response.status).toBe(500);
    expect(heard).toEqual([]);
  });
});
