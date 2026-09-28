/**
 * Pages on the origins `allowedOrigins` lists, calling the proxy from a
 * browser.
 *
 * The origin check admitted them, but the handler answered the browser's
 * preflight with 405 and put no `Access-Control-Allow-Origin` on any answer,
 * so the browser refused every call before or after it ran: the option could
 * not be used without CORS middleware no doc mentioned.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi } from "../src/define/index";
import { sendWebResponse, toWebRequest } from "../src/node";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const PAGE = "https://admin.example.com";
let upstream: Server;
let app: Server;
let proxyURL: string;

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "production");
  upstream = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json", etag: '"v1"' });
    res.end(JSON.stringify({ ok: true }));
  });
  const { endpoint } = courier();
  registerSources({
    api: defineApi({ baseURL: await listen(upstream), endpoints: { list: endpoint.get("list") } }),
  });

  const handler = createHandler({ allowedOrigins: [PAGE] });
  app = createServer(async (req, res) => {
    await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
  });
  proxyURL = `${await listen(app)}/api/request?_s=api&_m=list`;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  _resetSourcesForTests();
  for (const server of [app, upstream]) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

function preflight(origin: string): Promise<Response> {
  return fetch(proxyURL, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-custom",
    },
  });
}

function postFrom(origin: string, site: string): Promise<Response> {
  return fetch(proxyURL, {
    method: "POST",
    headers: { Origin: origin, "Sec-Fetch-Site": site, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

describe("a preflight", () => {
  it("is answered for a listed origin, with what the browser asked to send", async () => {
    const response = await preflight(PAGE);

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(PAGE);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toBe("content-type,x-custom");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("is refused for an origin that is not listed", async () => {
    const response = await preflight("https://evil.example");

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("is told apart from an OPTIONS request that asks for nothing, even on a stream route", async () => {
    const handler = createHandler({ allowedOrigins: [PAGE] });

    const response = await handler.handleSSE(
      new Request("http://app.local/api/sse?_s=api&_m=list", {
        method: "OPTIONS",
        headers: { Origin: PAGE, Accept: "text/event-stream" },
      }),
    );

    expect(response.status).toBe(405);
  });
});

describe("a call from a listed origin", () => {
  it("carries the permission a browser needs to read the answer", async () => {
    const response = await postFrom(PAGE, "cross-site");

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(PAGE);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("lets the page read the headers the proxy passes on", async () => {
    const response = await postFrom(PAGE, "cross-site");

    expect(response.headers.get("access-control-expose-headers")).toContain("etag");
  });

  it("reaches an SSE route with the same permission", async () => {
    const handler = createHandler({ allowedOrigins: [PAGE] });

    const response = await handler.handleSSE(
      new Request("http://app.local/api/sse?_s=api&_m=missing", {
        headers: { Origin: PAGE, "Sec-Fetch-Site": "cross-site", Accept: "text/event-stream" },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBe(PAGE);
  });
});

describe("a call that is not cross-origin", () => {
  it("gets no CORS headers", async () => {
    const response = await fetch(proxyURL, {
      method: "POST",
      headers: { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
