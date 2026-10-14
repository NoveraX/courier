/**
 * The user's real address, as an API behind Courier finds it with
 * `request-ip` — the library most Node APIs read a client's address with —
 * in every way a deployment puts proxies in front of the application, and
 * the request's id in every header an API logs it under.
 *
 * `request-ip` believes `X-Client-IP` first, then the first address of
 * `X-Forwarded-For`. The chain alone names the user wherever the proxies in
 * front append honestly; a user who writes a chain of their own through a
 * proxy that keeps it is named correctly only by the address Courier reads
 * from the right of the chain, which `clientAddress` sends in the headers
 * it names.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import requestIp from "request-ip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { rememberPeerAddress } from "../src/adapter/peer-address";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import type { ForwardOptions } from "../src/session/types";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();

const USER = "198.51.100.23";
const EDGE = "203.0.113.50";
const FILTER = "192.0.2.17";
const FORGED = "6.6.6.6";

let upstream: Server;
let upstreamURL: string;
const found: Array<{ ip: string | null; requestIds: Array<string | undefined> }> = [];

beforeEach(async () => {
  upstream = createServer((req, res) => {
    found.push({
      ip: requestIp.getClientIp(req),
      requestIds: [req.headers["x-request-id"], req.headers["x-correlation-id"]].map((value) =>
        Array.isArray(value) ? value.join(",") : value,
      ),
    });
    res.writeHead(200, { "content-type": "application/json" }).end("{}");
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  _resetSourcesForTests();
  found.length = 0;
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

function api(forward: ForwardOptions = {}) {
  return defineApi({
    expose: true,
    name: "api",
    baseURL: upstreamURL,
    forward,
    endpoints: { ping: endpoint.post("ping") },
  });
}

/* A browser's call through the proxy route, from `peer` as the adapter reports it. */
async function through(
  peer: string | undefined,
  headers: Record<string, string>,
  forward?: ForwardOptions,
) {
  registerSources({ api: api(forward) });
  const request = new Request("http://app.localhost/api/request?_s=api&_m=ping", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({}),
  });
  rememberPeerAddress(request, peer);
  await createHandler().handle(request);
  return found.at(-1)?.ip;
}

describe("the address an API finds with request-ip", () => {
  it("is the user's when the user connects to Courier, whatever the user claims", async () => {
    const claims = { "x-forwarded-for": FORGED, "x-client-ip": FORGED, "x-real-ip": FORGED };

    expect(await through(USER, claims)).toBe(USER);
  });

  it("is the user's behind a proxy on this machine that appends what it saw", async () => {
    expect(await through("127.0.0.1", { "x-forwarded-for": USER })).toBe(USER);
  });

  it("is the user's behind an edge proxy and an ingress, where the framework reports no connection", async () => {
    expect(await through(undefined, { "x-forwarded-for": `${USER}, ${EDGE}` })).toBe(USER);
  });

  it("is the user's when the user writes a chain through a proxy that keeps it, in the headers clientAddress names", async () => {
    const chain = { "x-forwarded-for": `${FORGED}, ${USER}` };

    expect(await through("10.0.0.2", chain)).toBe(FORGED);
    expect(await through("10.0.0.2", chain, { clientAddress: ["x-client-ip"] })).toBe(USER);
    expect(await through("10.0.0.2", chain, { clientAddress: ["x-forwarded-for"] })).toBe(USER);
  });

  it("is the user's behind a DDoS filter the deployment names, from the header the filter writes", async () => {
    vi.stubEnv("COURIER_TRUSTED_PROXIES", "192.0.2.0/24");
    vi.stubEnv("COURIER_CLIENT_ADDRESS_HEADER", "DDG-Connecting-IP");
    const replaced = { "x-forwarded-for": FILTER, "ddg-connecting-ip": USER };

    expect(await through("10.0.0.2", replaced, { clientAddress: ["x-client-ip"] })).toBe(USER);
  });

  it("is the user's IPv6 address", async () => {
    expect(await through("2001:db8::7", { "x-forwarded-for": FORGED })).toBe("2001:db8::7");
  });

  it("is the user's for server code given the request, in each header named", async () => {
    const page = new Request("https://shop.example/", {
      headers: { "x-forwarded-for": `${FORGED}, ${USER}, ${EDGE}` },
    });
    vi.stubEnv("COURIER_TRUSTED_PROXIES", EDGE);
    const caller = createCaller(api({ clientAddress: ["x-client-ip", "x-real-ip"] }), {
      context: { req: page },
    });

    await caller.ping();

    expect(found.at(-1)?.ip).toBe(USER);
  });
});

describe("the request id an API logs", () => {
  it("is the same under every header requestId names", async () => {
    const page = new Request("https://shop.example/", {
      headers: { "x-correlation-id": "7c1e9a04b2d84f6e9a35c0d1e8f2b6a4" },
    });
    const caller = createCaller(api({ requestId: ["x-request-id", "x-correlation-id"] }), {
      context: { req: page },
    });

    await caller.ping();

    expect(found.at(-1)?.requestIds).toEqual([
      "7c1e9a04b2d84f6e9a35c0d1e8f2b6a4",
      "7c1e9a04b2d84f6e9a35c0d1e8f2b6a4",
    ]);
  });
});
