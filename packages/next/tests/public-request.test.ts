/**
 * Next.js builds a route handler's `request.url` from the host it was started
 * with — `http://localhost:<port>` — whatever `Host` the browser sent. The
 * proxy compared the page's `Origin` with that URL, so in production every
 * POST from the app's own pages was refused with 403.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerSources } from "@noverax/courier";
import { apiRoute } from "../src/api-route";
import { publicRequest } from "../src/public-request";

let upstream: Server | undefined;
const upstreamHits: string[] = [];

beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "production");
  upstream = createServer((req, res) => {
    upstreamHits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify([{ id: 1 }]));
  });
  await new Promise<void>((resolve) => upstream?.listen(0, "127.0.0.1", resolve));
  const { endpoint } = courier();
  const users = defineGroup({ prefix: "users", endpoints: { create: endpoint.post("") } });
  const baseURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  registerSources({ api: defineApi({ baseURL, groups: { users } }) });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  upstreamHits.length = 0;
  upstream?.closeAllConnections();
  await new Promise<void>((resolve) => upstream?.close(() => resolve()) ?? resolve());
});

/** A POST as `next start` hands it to the route: URL on localhost, headers as sent. */
function postAsNextSeesIt(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost:7352/api/request?_s=api&_g=users&_m=create", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ variables: {} }),
  });
}

describe("apiRoute in production", () => {
  it("serves the app's own page behind a proxy that terminates TLS", async () => {
    const { POST } = apiRoute();

    const response = await POST(
      postAsNextSeesIt({
        host: "app.example.com",
        origin: "https://app.example.com",
        "x-forwarded-host": "app.example.com",
        "x-forwarded-proto": "https",
      }),
    );

    expect(response.status).toBe(200);
    expect(upstreamHits).toEqual(["POST /users"]);
  });

  it("serves the app's own page over plain HTTP on a network address", async () => {
    const { POST } = apiRoute();

    const response = await POST(
      postAsNextSeesIt({
        host: "10.0.0.5:7352",
        origin: "http://10.0.0.5:7352",
        "x-forwarded-host": "10.0.0.5:7352",
        "x-forwarded-proto": "http",
      }),
    );

    expect(response.status).toBe(200);
  });

  it("answers the preflight of a page on a listed origin", async () => {
    const { OPTIONS } = apiRoute({ allowedOrigins: ["https://admin.example.com"] });

    const response = await OPTIONS(
      new NextRequest("http://localhost:7352/api/request", {
        method: "OPTIONS",
        headers: {
          host: "app.example.com",
          origin: "https://admin.example.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://admin.example.com");
  });

  it("still refuses another site's page", async () => {
    const { POST } = apiRoute();

    const response = await POST(
      postAsNextSeesIt({
        host: "app.example.com",
        origin: "https://evil.example",
        "x-forwarded-host": "app.example.com",
        "x-forwarded-proto": "https",
      }),
    );

    expect(response.status).toBe(403);
    expect(upstreamHits).toEqual([]);
  });
});

describe("publicRequest", () => {
  it("names the host the client addressed, with the scheme it used", () => {
    const request = new Request("http://localhost:3000/api/request?_s=api", {
      headers: { "x-forwarded-host": "app.example.com, proxy.internal", "x-forwarded-proto": "https" },
    });

    expect(publicRequest(request).url).toBe("https://app.example.com/api/request?_s=api");
  });

  it("falls back to Host and the URL's own scheme", () => {
    const request = new Request("http://localhost:3000/api/request", {
      headers: { host: "10.0.0.5:3000" },
    });

    expect(publicRequest(request).url).toBe("http://10.0.0.5:3000/api/request");
  });

  it("keeps the request when it already names the addressed origin", () => {
    const request = new Request("http://localhost:3000/api/request", {
      headers: { host: "localhost:3000" },
    });

    expect(publicRequest(request)).toBe(request);
  });

  it("keeps the request when the host does not parse", () => {
    const request = new Request("http://localhost:3000/api/request", {
      headers: { "x-forwarded-host": "exa mple.com" },
    });

    expect(publicRequest(request)).toBe(request);
  });

  it("carries the body, method and headers across", async () => {
    const request = new Request("http://localhost:3000/api/request", {
      method: "POST",
      headers: { host: "app.example.com", "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });

    const addressed = publicRequest(request);

    expect(addressed.method).toBe("POST");
    expect(addressed.headers.get("content-type")).toBe("application/json");
    expect(await addressed.json()).toEqual({ a: 1 });
  });
});
