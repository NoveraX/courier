/**
 * A server reads the options a call is made with as their own properties
 * alone — the API's, its groups' and its endpoint's, the call's own and its
 * caller's context and defaults, checked or not — and the objects it builds
 * of them the same way; a page's caller made on a server reads its own the
 * same way, and an API is defined of what its definition says of its own.
 * What the core hands the platform — an answer's init, a request's, a
 * stream's source — says each key the platform reads of it. What
 * `Object.prototype` answers for a key they do not have, given it by code
 * elsewhere in the process for as long as the call takes, changes nothing of
 * the call: not where it goes, not what sends it, not how it follows a
 * redirect, not the headers it carries or its body, nor what the browser is
 * answered with, a refusal among them; nor what an endpoint defined
 * meanwhile is.
 */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../../src/adapter";
import type { HandlerConfig } from "../../src/adapter/handler-config";
import { type CallerDefaults, createCaller as createPageCaller } from "../../src/caller";
import { courier, defineApi, defineGroup } from "../../src/define";
import type { BuilderState } from "../../src/define/builder";
import type { CourierBaseConfig } from "../../src/define/builder-types";
import type {
  AnyEndpointOptions,
  ResolvedEndpointOptions,
  RetryOptions,
} from "../../src/define/options";
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
import { ENDPOINT_SCHEMA, type SchemaMetadata } from "../../src/validation";
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
  | keyof Context
  | keyof CallerDefaults,
  "next"
>;

/* What defining an API reads: what its definition says, a base's, an endpoint's builder as it
   gathers its parts, and what it puts on the endpoint. */
type DefinitionKey =
  | keyof CourierBaseConfig
  | keyof BuilderState
  | keyof SchemaMetadata
  | keyof AnyEndpointOptions
  | "name"
  | "groups"
  | "endpoints";

/* What the platform reads of what the core hands it: an answer's init, a stream's source and
   strategy, a transform, a decoder's options, a file's, a listener's, a pipe's. */
type PlatformKey =
  | keyof ResponseInit
  | keyof UnderlyingDefaultSource
  | keyof UnderlyingByteSource
  | keyof QueuingStrategy
  | keyof Transformer
  | keyof TextDecoderOptions
  | keyof TextDecodeOptions
  | keyof BlobPropertyBag
  | keyof FilePropertyBag
  | keyof AddEventListenerOptions
  | keyof StreamPipeOptions;

/* Every key of the options a call is made with, of each kind, of what defines an API, and of
   what the platform reads of the core's objects: one added to their types is missing here until
   it is written in. */
const EVERY_KEY = [
  ...Object.keys({
    agent: 0,
    allowHttp: 0,
    allowedHeaders: 0,
    allowedOrigins: 0,
    backoff: 0,
    baseMiddleware: 0,
    baseURL: 0,
    bearer: 0,
    bidirectional: 0,
    body: 0,
    bodySerializer: 0,
    cache: 0,
    call: 0,
    cancelPrevious: 0,
    client: 0,
    clientAddress: 0,
    coalesce: 0,
    context: 0,
    cookie: 0,
    cookies: 0,
    credentials: 0,
    csrf: 0,
    deadline: 0,
    defaultBody: 0,
    defaultCancelPrevious: 0,
    defaultQueryParams: 0,
    defaultTimeout: 0,
    defaults: 0,
    delay: 0,
    deprecated: 0,
    dispatcher: 0,
    duplex: 0,
    endpoints: 0,
    expose: 0,
    fetch: 0,
    filled: 0,
    forward: 0,
    forwardVariables: 0,
    from: 0,
    groups: 0,
    header: 0,
    headers: 0,
    idempotencyKey: 0,
    incoming: 0,
    inherit: 0,
    integrity: 0,
    jitter: 0,
    json: 0,
    keepalive: 0,
    kind: 0,
    kindNamed: 0,
    limit: 0,
    locale: 0,
    map: 0,
    maps: 0,
    maxDelay: 0,
    meta: 0,
    method: 0,
    middleware: 0,
    mock: 0,
    mode: 0,
    mutations: 0,
    name: 0,
    onDownloadProgress: 0,
    onError: 0,
    onRetry: 0,
    onSuccess: 0,
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
    receive: 0,
    redirect: 0,
    referrer: 0,
    referrerPolicy: 0,
    relay: 0,
    req: 0,
    requestId: 0,
    res: 0,
    response: 0,
    responseParser: 0,
    responseType: 0,
    retry: 0,
    retryOn: 0,
    schemas: 0,
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
    type: 0,
    typeNamed: 0,
    unsentUpload: 0,
    userAgent: 0,
    variables: 0,
    webSocket: 0,
    window: 0,
    withinOrigin: 0,
    ws: 0,
  } satisfies Record<OptionKey | DefinitionKey, 0>),
  "next",
  ...Object.keys({
    autoAllocateChunkSize: 0,
    cancel: 0,
    capture: 0,
    endings: 0,
    fatal: 0,
    flush: 0,
    highWaterMark: 0,
    ignoreBOM: 0,
    lastModified: 0,
    once: 0,
    passive: 0,
    preventAbort: 0,
    preventCancel: 0,
    preventClose: 0,
    pull: 0,
    readableType: 0,
    size: 0,
    start: 0,
    status: 0,
    statusText: 0,
    transform: 0,
    writableType: 0,
  } satisfies Record<Exclude<PlatformKey, OptionKey | DefinitionKey>, 0>),
];

/* What the platform reads of the stream it builds itself, for an answer's body that is not a
   stream, of whatever init the core hands it — asked of the platform, which builds no such answer
   while Object.prototype holds such a key. Node reads `autoAllocateChunkSize` so, and Node 22
   `cancel` too: given one there, no answer with a body is built, a refusal of the platform's own
   that the documentation names and no init of the core's changes. The table leaves them out. */
function readOfItsOwnStream(key: string): boolean {
  Object.defineProperty(Object.prototype, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: "follow",
  });
  try {
    return new Response("x", { status: 200, statusText: "", headers: {} }).status !== 200;
  } catch {
    return true;
  } finally {
    Reflect.deleteProperty(Object.prototype, key);
  }
}

const KEYS = EVERY_KEY.filter((key) => !readOfItsOwnStream(key));

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

/* What the platform reads of a request's init beside its headers, each from the init's prototype
   too where the init has none of its own — but a dispatcher, which Node reads of the request it
   builds itself, whatever init it is handed. */
const REQUEST_MEMBERS = [
  "method",
  "body",
  "signal",
  "redirect",
  "referrer",
  "referrerPolicy",
  "mode",
  "credentials",
  "cache",
  "integrity",
  "keepalive",
  "window",
  "duplex",
  "priority",
] as const;

/** What one request the call sent looked like, as the platform's `fetch` was handed it. */
interface Sent {
  url: string;
  headers: string[];
  /** The init's own keys */
  keys: string[];
  /** Each member the platform reads, as it reads it */
  members: Record<string, unknown>;
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

/* The same API as its author defines it with each part a definition is read of: a base and one
   derived of it, a group, an endpoint's refinements. */
function definedApi() {
  const base = courier({ meta: { owner: "accounts" } }).extend({ timeout: 5000 });
  return defineApi({
    name: "accounts",
    baseURL: UPSTREAM,
    session: { cookies: ["sid"], csrf: { cookie: "csrf", header: "x-csrf" } },
    forward: { userAgent: true, headers: ["x-tenant"] },
    allowedHeaders: ["x-api-version"],
    groups: {
      team: defineGroup({ prefix: "team", endpoints: { members: base.endpoint.get("members") } }),
    },
    endpoints: {
      me: base.endpoint
        .get("me")
        .expose()
        .meta({ by: "table" })
        .agent({ description: "Who one is", access: "read" })
        .map((answer: unknown) => answer),
      rename: base.endpoint
        .post("me/name")
        .variables<{ name: string }>()
        .headers(["x-trace"])
        .expose(),
      search: base.endpoint
        .post("search")
        .reads()
        .retry({ limit: 1, delay: 1, backoff: "fixed" })
        .cancelPrevious()
        .expose(),
      hidden: base.endpoint.get("hidden"),
      live: base.stream.response<number>().get("live").expose(),
    },
  });
}

/** A descriptor as a server reads it */
interface Descriptor {
  [ENDPOINT_SCHEMA]: unknown;
  kind: unknown;
  method: unknown;
  path: unknown;
  served: unknown;
  options: unknown;
}

/* What a definition says of each endpoint: all that a server reads of it. */
function definitionOf(api: ReturnType<typeof definedApi>): string {
  const { me, rename, search, hidden, live } = api as unknown as Record<string, Descriptor>;
  const groups = api.options.groups as unknown as Record<string, Record<string, Descriptor>>;
  const endpoints = { me, rename, search, hidden, live, members: groups.team?.members };
  return JSON.stringify(
    Object.entries(endpoints).map(([name, found]) => [
      name,
      found?.[ENDPOINT_SCHEMA],
      found?.kind,
      found?.method,
      found?.path,
      found?.served,
      found?.options,
      Object.keys(found ?? {}),
    ]),
  );
}

/* A member as a comparison reads it: a function, a signal or a stream by its kind. */
function shown(value: unknown): unknown {
  if (typeof value === "function") return "(a function)";
  if (value instanceof AbortSignal) return "(a signal)";
  if (value instanceof ReadableStream) return "(a stream)";
  return value;
}

/* The upstream: every request the call sends, as the platform's `fetch` is handed it, answered
   as the network answers — of nothing a prototype holds. */
function upstream(sent: Sent[]): void {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const members = init as Record<string, unknown> | undefined;
    sent.push({
      url,
      headers: [...new Headers(init?.headers)].map(([name, value]) => `${name}: ${value}`).sort(),
      keys: init === undefined ? [] : Object.keys(init).sort(),
      members: Object.fromEntries(REQUEST_MEMBERS.map((key) => [key, shown(members?.[key])])),
    });
    if (url.endsWith("/live")) {
      return new Response("data: 1\n\n", {
        status: 200,
        statusText: "",
        headers: { "content-type": "text/event-stream" },
      });
    }
    const headers = new Headers({ "content-type": "application/json", "x-api-version": "3" });
    headers.append("set-cookie", "sid=renewed; Path=/; Secure; HttpOnly");
    headers.append("set-cookie", "upstream_only=1; Path=/");
    return new Response(JSON.stringify({ ok: true }), { status: 200, statusText: "", headers });
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

/* What an error says of itself or of its class — not what `Object.prototype` answers for it. */
function said(error: object, key: string): unknown {
  for (let at: object | null = error; at !== null && at !== Object.prototype; ) {
    if (Object.hasOwn(at, key)) return Reflect.get(error, key);
    at = Object.getPrototypeOf(at) as object | null;
  }
  return undefined;
}

/* How a call ended, as the comparison reads it. */
function ended(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    return `failed: ${String(said(error, "code") ?? said(error, "status") ?? said(error, "name"))}`;
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

/* The same request, but for what `change` does to its headers. */
function withHeaders(request: Request, change: (headers: Headers) => void): Request {
  const headers = new Headers(request.headers);
  change(headers);
  return new Request(request, { headers });
}

async function answered(response: Response): Promise<string> {
  const headers = [...response.headers]
    .filter(([name]) => name !== "date" && name !== "x-courier-rid" && name !== "server-timing")
    .map(([name, value]) => `${name}: ${value}`)
    .sort();
  return `${response.status} ${response.statusText} | ${headers.join(" | ")} ${await response.text()}`;
}

/** One call, made from what was made ready for it before `Object.prototype` is given a key. */
type Call = () => Promise<string>;

/* The proxy, made once as a server makes it, answering the request afresh for each call. */
function proxyAnswering(config: HandlerConfig, request: Request): () => Call {
  const handler = createHandler(config);
  return () => {
    const sent = request.clone();
    return async () => answered(await handler.handle(sent));
  };
}

/* Each way a call is made: set up once, then made ready for each call, as a server serves each
   request afresh. */
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
  "a server's caller made while serving a request": async () => {
    const api = accountsApi();
    return () => {
      const request = served("GET");
      return async () =>
        JSON.stringify(await withIncomingRequest(request, () => createCaller(api).me()));
    };
  },
  "a page's caller made on a server, naming the request": async () => {
    const api = accountsApi();
    createCaller(api);
    return () => {
      const req = new Request(`${APP}/account`, { headers: BROWSER_HEADERS });
      return async () => JSON.stringify(await createPageCaller(api, { context: { req } }).me());
    };
  },
  "a page's caller made on a server, naming no request": async () => {
    const api = accountsApi();
    createCaller(api);
    return () => async () => JSON.stringify(await createPageCaller(api).me());
  },
  "the proxy answers a browser's read": async () => {
    const api = accountsApi();
    registerSources({ accounts: api });
    return proxyAnswering({}, await proxyRequestOf(api, "me"));
  },
  "the proxy answers a browser's write": async () => {
    const api = accountsApi();
    registerSources({ accounts: api });
    return proxyAnswering({}, await proxyRequestOf(api, "rename"));
  },
  "the proxy refuses an endpoint no mark opens": async () => {
    const api = accountsApi();
    registerSources({ accounts: api });
    const request = await proxyRequestOf(api, "me");
    return proxyAnswering({}, new Request(request.url.replace("_m=me", "_m=hidden"), request));
  },
  "the proxy refuses a host it does not serve": async () => {
    const api = accountsApi();
    const request = await proxyRequestOf(api, "me");
    return proxyAnswering({ sources: { accounts: api }, allowedHosts: ["other.example"] }, request);
  },
  "the proxy refuses a page of another origin": async () => {
    const api = accountsApi();
    const request = withHeaders(await proxyRequestOf(api, "me"), (headers) => {
      headers.set("origin", "https://evil.example");
      headers.set("sec-fetch-site", "cross-site");
    });
    return proxyAnswering({ sources: { accounts: api } }, request);
  },
  "the proxy refuses a script when it serves browsers alone": async () => {
    const api = accountsApi();
    const request = withHeaders(await proxyRequestOf(api, "me"), (headers) => {
      headers.delete("origin");
      headers.delete("sec-fetch-site");
    });
    return proxyAnswering({ sources: { accounts: api }, browsersOnly: true }, request);
  },
  "the proxy refuses a method it does not serve": async () => {
    const api = accountsApi();
    const request = await proxyRequestOf(api, "me");
    const put = new Request(request.url, { method: "PUT", headers: request.headers });
    return proxyAnswering({ sources: { accounts: api } }, put);
  },
  "the proxy refuses a body past its limit": async () => {
    const api = accountsApi();
    const request = await proxyRequestOf(api, "rename");
    return proxyAnswering({ sources: { accounts: api }, maxBodyBytes: 8 }, request);
  },
  "the proxy refuses a request that names no endpoint": async () => {
    const api = accountsApi();
    const request = await proxyRequestOf(api, "me");
    const unnamed = new Request(request.url.replace(/\?.*$/, ""), request);
    return proxyAnswering({ sources: { accounts: api } }, unnamed);
  },
  "the proxy refuses a caller past its rate limit": async () => {
    const api = accountsApi();
    const request = await proxyRequestOf(api, "me");
    let caller = 0;
    const handler = createHandler({
      sources: { accounts: api },
      rateLimit: { requests: 1, window: 60_000, key: () => `caller ${caller}` },
    });
    return () => {
      caller += 1;
      const first = request.clone();
      const second = request.clone();
      return async () =>
        `${await answered(await handler.handle(first))} then ${await answered(await handler.handle(second))}`;
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
  "an API defined, then served": async () => {
    const request = await proxyRequestOf(accountsApi(), "me");
    const hidden = new Request(request.url.replace("_m=me", "_m=hidden"), request);
    return () => {
      const sent = hidden.clone();
      return async () => {
        const api = definedApi();
        const handler = createHandler({ sources: { accounts: api } });
        return `${definitionOf(api)} ${await answered(await handler.handle(sent))}`;
      };
    };
  },
};

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
  expect(EVERY_KEY.filter((key) => Object.hasOwn(Object.prototype, key))).toEqual([]);
});

describe("a call, while Object.prototype answers for a key its options do not have", () => {
  it.each(Object.keys(SCENARIOS))(
    "%s, is the call it is without",
    async (name) => {
      const setUp = SCENARIOS[name];
      if (setUp === undefined) throw new Error(`no scenario ${name}`);
      const sent: Sent[] = [];
      upstream(sent);
      const ready = await setUp();
      upstream(sent);
      const clean = await runOnce(ready(), sent);
      expect(JSON.stringify(await runOnce(ready(), sent))).toBe(JSON.stringify(clean));
      const changed: string[] = [];
      for (const key of KEYS) {
        for (const value of HOSTILE) {
          const call = ready();
          const run = await withPrototypeKey(key, value, () => runOnce(call, sent));
          const label = `Object.prototype.${key} = ${typeof value === "function" ? "a function" : JSON.stringify(value)}`;
          if (JSON.stringify(run) !== JSON.stringify(clean)) changed.push(label);
        }
      }

      expect(changed).toEqual([]);
    },
    120_000,
  );
});
