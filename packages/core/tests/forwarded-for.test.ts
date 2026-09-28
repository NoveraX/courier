/**
 * The client address a proxied call tells its upstream.
 *
 * The proxy copied `X-Forwarded-For`, `X-Real-IP`, `Forwarded` and
 * `X-Client-IP` from the caller's request, so any page could write the address
 * the upstream's rate limits and allowlists believed, and the proxy never
 * added the address it actually saw.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHandler } from "../src/adapter";
import { rememberPeerAddress } from "../src/adapter/peer-address";
import { courier, defineApi } from "../src/define/index";
import { sendWebResponse, toWebRequest } from "../src/node";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const SPOOFED = {
  "x-forwarded-for": "6.6.6.6",
  "x-real-ip": "6.6.6.7",
  forwarded: "for=6.6.6.8",
  "x-client-ip": "6.6.6.9",
};

let upstream: Server;
let upstreamURL: string;
let seen: IncomingHttpHeaders | undefined;

beforeEach(async () => {
  upstream = createServer((req, res) => {
    seen = req.headers;
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});

afterEach(async () => {
  _resetSourcesForTests();
  seen = undefined;
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

function register(allowedHeaders?: string[]): void {
  const { endpoint } = courier();
  registerSources({
    api: defineApi({ baseURL: upstreamURL, allowedHeaders, endpoints: { ping: endpoint.post("ping") } }),
  });
}

function callFrom(peer: string | undefined): Promise<Response> {
  const request = new Request("http://app.local/api/request", {
    method: "POST",
    headers: { "content-type": "application/json", ...SPOOFED },
    body: JSON.stringify({ source: "api", method: "ping" }),
  });
  rememberPeerAddress(request, peer);
  return createHandler().handle(request);
}

describe("a caller on a public address", () => {
  it("is named by the address the proxy saw, whatever it claims", async () => {
    register();

    await callFrom("203.0.113.9");

    expect(seen?.["x-forwarded-for"]).toBe("203.0.113.9");
    expect(seen?.["x-real-ip"]).toBeUndefined();
    expect(seen?.forwarded).toBeUndefined();
    expect(seen?.["x-client-ip"]).toBeUndefined();
  });
});

describe("a reverse proxy in front of the application", () => {
  it("has its chain kept and the address it connected from appended", async () => {
    register();
    const handler = createHandler();
    const app = createServer(async (req, res) => {
      await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
    });
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));

    await fetch(`http://127.0.0.1:${(app.address() as AddressInfo).port}/api/request`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.4" },
      body: JSON.stringify({ source: "api", method: "ping" }),
    });
    app.closeAllConnections();
    await new Promise<void>((resolve) => app.close(() => resolve()));

    expect(seen?.["x-forwarded-for"]).toMatch(/^198\.51\.100\.4, (127\.0\.0\.1|::1)$/);
  });
});

describe("a runtime that does not know the caller's address", () => {
  it("tells the upstream no address rather than the one the caller wrote", async () => {
    register();

    await callFrom(undefined);

    expect(seen?.["x-forwarded-for"]).toBeUndefined();
    expect(seen?.["x-real-ip"]).toBeUndefined();
  });

  it("forwards the header as sent where the source trusts whoever wrote it", async () => {
    register(["x-forwarded-for"]);

    await callFrom(undefined);

    expect(seen?.["x-forwarded-for"]).toBe("6.6.6.6");
  });
});
