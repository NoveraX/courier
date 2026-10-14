/**
 * The user's address and the request id a call made on the server tells its
 * upstream. A Next.js route handler is not told the connection's address:
 * Next.js records it in `X-Forwarded-For` itself where no proxy in front
 * did, and a proxy in front appends what it saw. That chain goes on as it
 * came — from the proxy route, from its streams, and from middleware given
 * the request — and so does the request id nginx wrote.
 */

import { createCaller } from "@noverax/courier";
import { courier, defineApi, type Sources } from "@noverax/courier/define";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { _resetSourcesForTests } from "../../core/src/sources";
import { startUpstream, type Upstream } from "../../core/tests/helpers/upstream";
import { apiRoute } from "../src/api-route";
import { sseRoute } from "../src/sse-route";

const { endpoint, stream } = courier();

/* As a request reaches Next.js behind an ingress that a DDoS filter or a balancer stands in front of. */
const BEHIND_PROXIES = {
  "x-forwarded-for": "198.51.100.23, 203.0.113.50",
  "x-request-id": "7c1e9a04b2d84f6e9a35c0d1e8f2b6a4",
};

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
  _resetSourcesForTests();
});

async function siteApi() {
  upstream = await startUpstream((request, res) => {
    if (request.url.startsWith("/live")) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end("data: 1\n\n");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  return defineApi({
    expose: true,
    name: "site",
    baseURL: upstream.url,
    forward: { requestId: true },
    endpoints: {
      read: endpoint.get("read"),
      write: endpoint.post("write"),
      live: stream.response<number>().get("live"),
    },
  });
}

async function sources(): Promise<Sources> {
  return { site: await siteApi() };
}

function sent(): Array<[unknown, unknown]> {
  return (upstream?.received ?? []).map(({ headers }) => [
    headers["x-forwarded-for"],
    headers["x-request-id"],
  ]);
}

const KEPT: [string, string] = [BEHIND_PROXIES["x-forwarded-for"], BEHIND_PROXIES["x-request-id"]];

describe("the Next.js proxy route", () => {
  it("passes on the chain and the request id, on a read and on a write", async () => {
    const { GET, POST } = apiRoute({ sources: await sources() });

    await GET(
      new NextRequest("http://localhost:3000/api/request?_s=site&_m=read", {
        headers: BEHIND_PROXIES,
      }),
    );
    await POST(
      new NextRequest("http://localhost:3000/api/request?_s=site&_m=write", {
        method: "POST",
        headers: { ...BEHIND_PROXIES, "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(sent()).toEqual([KEPT, KEPT]);
  });

  it("opens a relayed stream with them", async () => {
    const { GET } = sseRoute({ sources: await sources() });
    const controller = new AbortController();

    const response = await GET(
      new NextRequest("http://localhost:3000/api/sse?_s=site&_m=live", {
        headers: { ...BEHIND_PROXIES, accept: "text/event-stream" },
        signal: controller.signal,
      }),
    );
    await vi.waitFor(() => expect(upstream?.received).toHaveLength(1));
    controller.abort();
    await response.body?.cancel().catch(() => undefined);

    expect(sent()).toEqual([KEPT]);
  });
});

describe("middleware given the request", () => {
  it("passes on the chain and the request id", async () => {
    const site = await siteApi();
    const request = new NextRequest("https://shop.example/ceny", { headers: BEHIND_PROXIES });

    await createCaller(site, { context: { req: request } }).read();

    expect(sent()).toEqual([KEPT]);
  });
});
