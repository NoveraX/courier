/**
 * A server reads the options a call is made with as their own properties
 * alone — the API's, its groups' and its endpoint's, the call's own and its
 * caller's context, checked or not — and the objects it builds of them the
 * same way. What `Object.prototype` answers for a key they do not have,
 * given it by code elsewhere in the process for as long as the call takes,
 * changes nothing of the call: not where it goes, not what sends it, not
 * how it follows a redirect, not the headers it carries or its body, nor
 * what the browser is answered with.
 */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../../src/adapter";
import { createCaller as createPageCaller } from "../../src/caller";
import { courier, defineApi } from "../../src/define";
import type { ResolvedEndpointOptions, RetryOptions } from "../../src/define/options";
import { routesOf } from "../../src/define/routes-of";
import type { RequestOptions } from "../../src/http-client/call-transport";
import type {
  BaseOptions,
  BoundMethodOptions,
  CallOptions,
  Context,
  FetchOptions,
  GroupOptions,
} from "../../src/http-client/types";
import { withIncomingRequest } from "../../src/node-request-context";
import { createProxyCaller } from "../../src/proxy-caller";
import { createCaller } from "../../src/server/create-caller";
import { _resetSourcesForTests, registerSources } from "../../src/server/sources";
import type { IncomingRequest } from "../../src/session/incoming-request";
import type { CsrfOptions, ForwardOptions, SessionOptions } from "../../src/session/types";
import type { CoreFetchInit } from "../../src/utils/fetch";
import { asBrowserPage } from "../helpers/browser-page";

/* `next`, the key Next.js's types give every request's init, is in the program only beside them. */
type OptionKey = Exclude<
  | keyof BaseOptions
  | keyof GroupOptions
  | keyof ResolvedEndpointOptions
  | keyof RetryOptions
  | keyof CallOptions
  | keyof FetchOptions
  | keyof CoreFetchInit
  | keyof RequestOptions
  | keyof BoundMethodOptions
  | keyof SessionOptions
  | keyof CsrfOptions
  | keyof ForwardOptions
  | keyof Context,
  "next"
>;

/* Every key of the options a call is made with, of each kind: one added to their types is
   missing here until it is written in. */
const KEYS = [
  ...Object.keys({
    agent: 0,
    allowHttp: 0,
    allowedHeaders: 0,
    allowedOrigins: 0,
    backoff: 0,
    baseURL: 0,
    bearer: 0,
    body: 0,
    bodySerializer: 0,
    cache: 0,
    call: 0,
    cancelPrevious: 0,
    client: 0,
    clientAddress: 0,
    coalesce: 0,
    cookie: 0,
    cookies: 0,
    credentials: 0,
    csrf: 0,
    deadline: 0,
    defaultBody: 0,
    defaultCancelPrevious: 0,
    defaultQueryParams: 0,
    defaultTimeout: 0,
    delay: 0,
    deprecated: 0,
    dispatcher: 0,
    duplex: 0,
    expose: 0,
    fetch: 0,
    forward: 0,
    forwardVariables: 0,
    from: 0,
    header: 0,
    headers: 0,
    idempotencyKey: 0,
    incoming: 0,
    inherit: 0,
    integrity: 0,
    jitter: 0,
    json: 0,
    keepalive: 0,
    limit: 0,
    locale: 0,
    maxDelay: 0,
    meta: 0,
    method: 0,
    middleware: 0,
    mock: 0,
    mode: 0,
    mutations: 0,
    onDownloadProgress: 0,
    onRetry: 0,
    onUploadProgress: 0,
    operation: 0,
    pathOptions: 0,
    prefix: 0,
    prefixUrl: 0,
    priority: 0,
    proxy: 0,
    proxyMethod: 0,
    proxyPath: 0,
    proxyReceiveAt: 0,
    random: 0,
    rawData: 0,
    reads: 0,
    redirect: 0,
    referrer: 0,
    referrerPolicy: 0,
    relay: 0,
    req: 0,
    requestId: 0,
    res: 0,
    responseParser: 0,
    responseType: 0,
    retry: 0,
    retryOn: 0,
    searchParams: 0,
    searchParamsSerializer: 0,
    sensitiveVariables: 0,
    session: 0,
    signal: 0,
    stream: 0,
    studioRequestId: 0,
    tags: 0,
    timeout: 0,
    tls: 0,
    topicKey: 0,
    trace: 0,
    transport: 0,
    unsentUpload: 0,
    userAgent: 0,
    variables: 0,
    webSocket: 0,
    window: 0,
    withinOrigin: 0,
  } satisfies Record<OptionKey, 0>),
  "next",
];

const { endpoint, stream } = courier();
const UPSTREAM = "https://upstream.example";
const APP = "https://app.example.com";

/* What a value `Object.prototype` is given in place of an option does, where something reads it. */
const hostileCalls: unknown[][] = [];
function hostile(...args: unknown[]): Promise<Response> {
  hostileCalls.push(args);
  return Promise.resolve(Response.json({ hostile: true }));
}

/* Values of each kind an option may be — a function, an address, a mode, an object of headers,
   a list of names, a flag, a number — so that whatever reads one acts on it. */
const HOSTILE: readonly unknown[] = [
  hostile,
  "https://evil.example/elsewhere",
  "follow",
  { "x-evil": "1", cookie: "evil=1" },
  ["cookie", "set-cookie", "x-evil"],
  true,
  1,
];

/**
 * What one request the call sent looked like, as the platform's `fetch` was
 * handed it — its method and body read as the platform reads them, from the
 * init's prototype too where the init has none of its own.
 */
interface Sent {
  url: string;
  method: string;
  headers: string[];
  /** The init's own keys, `redirect` among them where it has one */
  keys: string[];
  redirect: unknown;
  body: string | null;
}

/** What a call did: what it sent, how it ended, and what the browser was answered with. */
interface Run {
  sent: Sent[];
  outcome: string;
  hostile: number;
}

function accountsApi() {
  return defineApi({
    name: "accounts",
    baseURL: UPSTREAM,
    session: { cookies: ["sid"], csrf: { cookie: "csrf", header: "x-csrf" } },
    forward: { userAgent: true, headers: ["x-tenant"] },
    allowedHeaders: ["x-api-version"],
    endpoints: {
      me: endpoint.get("me").expose(),
      rename: endpoint.post("me/name").variables<{ name: string }>().expose(),
      hidden: endpoint.get("hidden"),
      live: stream.response<number>().get("live").expose(),
    },
  });
}

/* The upstream: every request the call sends, as the platform's `fetch` is handed it. */
function upstream(sent: Sent[]): void {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    sent.push({
      url,
      method: String(init?.method ?? "GET"),
      headers: [...new Headers(init?.headers)].map(([name, value]) => `${name}: ${value}`).sort(),
      keys: init === undefined ? [] : Object.keys(init).sort(),
      redirect: init !== undefined && Object.hasOwn(init, "redirect") ? init.redirect : undefined,
      body: typeof init?.body === "string" ? init.body : init?.body == null ? null : "(stream)",
    });
    if (url.endsWith("/live")) {
      return new Response("data: 1\n\n", { headers: { "content-type": "text/event-stream" } });
    }
    const headers = new Headers({ "content-type": "application/json", "x-api-version": "3" });
    headers.append("set-cookie", "sid=renewed; Path=/; Secure; HttpOnly");
    headers.append("set-cookie", "upstream_only=1; Path=/");
    return new Response(JSON.stringify({ ok: true }), { headers });
  });
}

/* What the browser's request being served carries: the session, its token, what `forward` takes. */
const BROWSER_HEADERS = {
  cookie: "sid=made-up-session; csrf=made-up-token",
  "x-tenant": "t1",
  "user-agent": "browser/1",
  "sec-fetch-site": "same-origin",
  origin: APP,
};

const served = (method: string): IncomingRequest => ({
  key: {},
  method,
  origin: APP,
  headers: new Headers(BROWSER_HEADERS),
});

/* A stream's answer, read up to its first event and let go. */
async function firstEvent(body: ReadableStream<Uint8Array> | null): Promise<string> {
  const reader = body?.getReader();
  let text = "";
  while (reader !== undefined && !text.includes("data:")) {
    const { done, value } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  await reader?.cancel();
  return text;
}

/* How a call ended, as the comparison reads it. */
function ended(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const { code, status, name } = error as { code?: unknown; status?: unknown; name?: unknown };
    return `failed: ${String(code ?? status ?? name)}`;
  }
  return `failed: ${String(error)}`;
}

/* A browser's request of the proxy, as the proxy caller makes it, kept to be sent again. */
async function proxyRequestOf(api: ReturnType<typeof accountsApi>, call: string): Promise<Request> {
  let captured: Request | undefined;
  asBrowserPage();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    captured = new Request(new URL(url, APP), init);
    return Response.json({ ok: true });
  });
  const client = createProxyCaller(routesOf(api, "accounts")) as unknown as Record<
    string,
    (variables?: unknown) => Promise<unknown>
  >;
  await client[call]?.(call === "rename" ? { name: "x" } : undefined);
  vi.unstubAllGlobals();
  if (captured === undefined) throw new Error(`the proxy caller sent nothing for ${call}`);
  const headers = new Headers(captured.headers);
  headers.set("cookie", "sid=made-up-session; csrf=made-up-token");
  headers.set("origin", APP);
  headers.set("sec-fetch-site", "same-origin");
  headers.set("x-api-version", "from-browser");
  return new Request(captured, { headers });
}

/** One call, made from what was made ready for it before `Object.prototype` is given a key. */
type Call = () => Promise<string>;

/* Each way a server makes a call: set up once, then made ready for each call, as a server serves
   each request afresh. */
const SCENARIOS: Record<string, () => Promise<() => Call>> = {
  "a server's caller reads, serving a request": async () => {
    const caller = createCaller(accountsApi());
    return () => {
      const request = served("GET");
      return async () => JSON.stringify(await withIncomingRequest(request, () => caller.me()));
    };
  },
  "a server's caller writes, serving a request": async () => {
    const caller = createCaller(accountsApi());
    return () => {
      const request = served("POST");
      return async () =>
        JSON.stringify(await withIncomingRequest(request, () => caller.rename({ name: "x" })));
    };
  },
  "a page's caller reads on a server, naming the request": async () => {
    const api = accountsApi();
    createCaller(api);
    return () => {
      const req = new Request(`${APP}/account`, { headers: BROWSER_HEADERS });
      const caller = createPageCaller(api, { context: { req } });
      return async () => JSON.stringify(await caller.me());
    };
  },
  "the proxy answers a browser's read": async () => {
    const api = accountsApi();
    registerSources({ accounts: api });
    const request = await proxyRequestOf(api, "me");
    const handler = createHandler();
    return () => {
      const sent = request.clone();
      return async () => answered(await handler.handle(sent));
    };
  },
  "the proxy answers a browser's write": async () => {
    const api = accountsApi();
    registerSources({ accounts: api });
    const request = await proxyRequestOf(api, "rename");
    const handler = createHandler();
    return () => {
      const sent = request.clone();
      return async () => answered(await handler.handle(sent));
    };
  },
  "the proxy refuses an endpoint no mark opens": async () => {
    const api = accountsApi();
    registerSources({ accounts: api });
    const request = await proxyRequestOf(api, "me");
    const hidden = new Request(request.url.replace("_m=me", "_m=hidden"), request);
    const handler = createHandler();
    return () => {
      const sent = hidden.clone();
      return async () => answered(await handler.handle(sent));
    };
  },
  "the proxy relays a browser's stream": async () => {
    const api = accountsApi();
    const handler = createHandler({ sources: { accounts: api } });
    const request = new Request("http://localhost/api/sse?_s=accounts&_m=live", {
      headers: { accept: "text/event-stream", cookie: "sid=made-up-session" },
    });
    return () => {
      const sent = request.clone();
      return async () => {
        const response = await handler.handle(sent);
        return `${response.status} ${await firstEvent(response.body)}`;
      };
    };
  },
  "a server's caller opens a stream, serving a request": async () => {
    const caller = createCaller(accountsApi());
    return () => {
      const request = served("GET");
      return async () => {
        const sub = withIncomingRequest(request, () => caller.live());
        const events: unknown[] = [];
        for await (const event of sub) {
          events.push(event);
          break;
        }
        sub.close();
        return JSON.stringify(events);
      };
    };
  },
};

async function answered(response: Response): Promise<string> {
  const headers = [...response.headers]
    .filter(([name]) => name !== "date" && name !== "x-courier-rid" && name !== "server-timing")
    .map(([name, value]) => `${name}: ${value}`)
    .sort();
  return `${response.status} ${headers.join(" | ")} ${await response.text()}`;
}

/* A call made once, its outcome kept with what it sent, cut short where it waits too long. */
async function runOnce(call: Call, sent: Sent[]): Promise<Run> {
  hostileCalls.length = 0;
  sent.length = 0;
  let outcome: string;
  try {
    outcome = await Promise.race([
      call(),
      new Promise<string>((resolve) => setTimeout(() => resolve("waits"), 1000)),
    ]);
  } catch (error) {
    outcome = ended(error);
  }
  return { sent: [...sent], outcome, hostile: hostileCalls.length };
}

/* `Object.prototype` given `key` for as long as `run` takes, as code elsewhere in a process may. */
async function withPrototypeKey<T>(key: string, value: unknown, run: () => Promise<T>): Promise<T> {
  Object.defineProperty(Object.prototype, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
  try {
    return await run();
  } finally {
    Reflect.deleteProperty(Object.prototype, key);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

afterAll(() => {
  expect(KEYS.filter((key) => Object.hasOwn(Object.prototype, key))).toEqual([]);
});

describe("a server's call, while Object.prototype answers for a key its options do not have", () => {
  it("is the call it is without", async () => {
    const changed: string[] = [];
    for (const [name, setUp] of Object.entries(SCENARIOS)) {
      const sent: Sent[] = [];
      upstream(sent);
      const ready = await setUp();
      upstream(sent);
      const clean = await runOnce(ready(), sent);
      expect(JSON.stringify(await runOnce(ready(), sent)), name).toBe(JSON.stringify(clean));
      for (const key of KEYS) {
        for (const value of HOSTILE) {
          const call = ready();
          const run = await withPrototypeKey(key, value, () => runOnce(call, sent));
          const label = `${name}: Object.prototype.${key} = ${typeof value === "function" ? "a function" : JSON.stringify(value)}`;
          if (JSON.stringify(run) !== JSON.stringify(clean)) changed.push(label);
        }
      }
    }

    expect(changed).toEqual([]);
  }, 120_000);
});
