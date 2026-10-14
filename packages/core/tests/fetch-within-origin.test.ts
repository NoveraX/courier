/**
 * Upstream redirects, as the proxy meets them.
 *
 * `fetch` follows every redirect by default and drops only `Authorization`
 * and `Cookie` when one leaves the origin, so the proxy's request follows a
 * redirect only within the upstream's origin, unless the source asks for
 * every one: a key a server-side middleware adds would otherwise go wherever
 * the upstream points — an open redirect on the upstream handing it to any
 * host.
 */
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { defineMiddleware } from "../src/middleware/define";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { fetchWithinOrigin } from "../src/utils/fetch-within-origin";

const withKey = defineMiddleware("server-key", "before", (ctx) => {
  ctx.headers.set("x-api-key", "server-secret");
});

interface Seen {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

let upstream: Server;
let foreign: Server;
let upstreamURL: string;
let foreignURL: string;
const upstreamSeen: Seen[] = [];
const foreignSeen: Seen[] = [];

function recording(seen: Seen[], answer: (url: URL, res: ServerResponse, body: string) => void) {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      answer(new URL(req.url ?? "/", "http://upstream"), res, body);
    });
  });
}

async function listen(server: Server, host: string): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://${host}:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  upstream = recording(upstreamSeen, (url, res, body) => {
    /* A GET names the redirect in its query, a POST in its JSON body. */
    const sent: { to?: string; status?: number } = body ? JSON.parse(body) : {};
    const to = url.searchParams.get("to") ?? sent.to;
    const status = Number(url.searchParams.get("status") ?? sent.status ?? 302);
    if (url.pathname === "/loop") {
      res.writeHead(302, { location: "/loop" });
      res.end();
      return;
    }
    if (url.pathname === "/redir" && to) {
      res.writeHead(status, { location: to });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ at: url.pathname }));
  });
  foreign = recording(foreignSeen, (_url, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ at: "foreign" }));
  });
  upstreamURL = await listen(upstream, "127.0.0.1");
  /* The same machine under another name is another origin. */
  foreignURL = await listen(foreign, "localhost");

  const { endpoint } = courier();
  const misc = defineGroup({
    prefix: "",
    endpoints: {
      redir: endpoint.get("redir").use(withKey),
      send: endpoint.post("redir").use(withKey),
    },
  });
  registerSources({ api: defineApi({ expose: true, baseURL: upstreamURL, groups: { misc } }) });
});

afterEach(async () => {
  _resetSourcesForTests();
  upstreamSeen.length = 0;
  foreignSeen.length = 0;
  for (const server of [upstream, foreign]) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function proxy(method: "redir" | "send", variables: Record<string, unknown>): Promise<Response> {
  return createHandler().handlePost(
    new Request(`http://app.localhost/api/request?_s=api&_g=misc&_m=${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variables }),
    }),
  );
}

describe("a proxied call the upstream redirects", () => {
  it("does not follow a redirect to another origin, so the server's key stays home", async () => {
    const response = await proxy("redir", { to: `${foreignURL}/leak`, status: 302 });

    expect(foreignSeen).toEqual([]);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBeNull();
  });

  it("follows a redirect that stays on the upstream's origin", async () => {
    const response = await proxy("redir", { to: "/moved", status: 308 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ at: "/moved" });
    expect(upstreamSeen.at(-1)?.headers["x-api-key"]).toBe("server-secret");
  });

  it("sends the body again where the status keeps the method", async () => {
    await proxy("send", { to: "/moved", status: 307, note: "kept" });

    expect(upstreamSeen.at(-1)).toMatchObject({ method: "POST", url: "/moved" });
    expect(JSON.parse(upstreamSeen.at(-1)?.body ?? "{}")).toMatchObject({ note: "kept" });
  });

  it("turns a POST into a GET without its body where the status says to", async () => {
    await proxy("send", { to: "/moved", status: 303, note: "dropped" });

    const last = upstreamSeen.at(-1);
    expect(last).toMatchObject({ method: "GET", url: "/moved", body: "" });
    expect(last?.headers["content-type"]).toBeUndefined();
  });
});

describe("a source that asks for every redirect to be followed", () => {
  it("follows one to another origin, as it chose", async () => {
    const { endpoint } = courier();
    registerSources({
      api: defineApi({
        expose: true,
        baseURL: upstreamURL,
        redirect: "follow",
        endpoints: { redir: endpoint.get("redir") },
      }),
    });

    const response = await createHandler().handleGet(
      new Request(
        `http://app.localhost/api/request?_s=api&_m=redir&_v=${encodeURIComponent(JSON.stringify({ to: `${foreignURL}/x` }))}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(foreignSeen).toHaveLength(1);
  });
});

describe("a server-side call", () => {
  it("keeps fetch's own redirect handling", async () => {
    const { endpoint } = courier();
    const api = defineApi({
      expose: true,
      baseURL: upstreamURL,
      endpoints: { redir: endpoint.get("redir").variables<{ to: string }>() },
    });

    await createCaller(api).redir({ to: `${foreignURL}/x` });

    expect(foreignSeen).toHaveLength(1);
  });
});

describe("fetchWithinOrigin", () => {
  it("stops after twenty hops rather than looping", async () => {
    const response = await fetchWithinOrigin(`${upstreamURL}/loop`, {});

    expect(response.status).toBe(302);
    expect(upstreamSeen).toHaveLength(21);
  });

  it("does not replay a body it has already sent as a stream", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ note: "once" })));
        controller.close();
      },
    });

    const response = await fetchWithinOrigin(`${upstreamURL}/redir?to=%2Fmoved&status=307`, {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);

    expect(response.status).toBe(307);
    expect(upstreamSeen).toHaveLength(1);
  });
});
