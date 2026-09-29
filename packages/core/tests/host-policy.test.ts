/**
 * The host a request was addressed to, checked on every entry point.
 *
 * A DNS-rebinding page points its own name at the machine the app runs on.
 * Its requests then look same-origin to the browser and to the origin rule,
 * and only the app knowing its own names can refuse them.
 */
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import type { HandlerConfig } from "../src/adapter/handler-config";
import { isHostAccepted } from "../src/adapter/host-policy";
import { courier, defineApi } from "../src/define/index";
import { sendWebResponse, toWebRequest } from "../src/node";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { echo, startUpstream, type Upstream } from "./helpers/upstream";

describe("isHostAccepted", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "localhost:3000",
    "LOCALHOST",
    "app.localhost:5173",
    "127.0.0.1:8080",
    "127.8.9.10",
    "[::1]:3000",
    "192.168.1.20:3000",
    "10.0.0.7",
    "[fe80::1]",
  ])("serves %s, which no one can point elsewhere", (host) => {
    expect(isHostAccepted(host)).toBe(true);
  });

  it("refuses any other name outside production when nothing is configured", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(isHostAccepted("rebound.example:3000")).toBe(false);
  });

  it("serves every name in production when nothing is configured", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(isHostAccepted("app.example.com")).toBe(true);
  });

  it("serves only the configured names once there are some, in production too", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(isHostAccepted("app.example.com:443", ["App.Example.com"])).toBe(true);
    expect(isHostAccepted("other.example.com", ["app.example.com"])).toBe(false);
    expect(isHostAccepted("localhost:3000", ["app.example.com"])).toBe(true);
  });

  it("reads a wildcard as the sub-domains of a name, not the name itself", () => {
    expect(isHostAccepted("eu.app.example.com", ["*.example.com"])).toBe(true);
    expect(isHostAccepted("example.com", ["*.example.com"])).toBe(false);
    expect(isHostAccepted("badexample.com", ["*.example.com"])).toBe(false);
  });

  it("refuses a host that names no machine", () => {
    expect(isHostAccepted("bad host/", ["bad host/"])).toBe(false);
  });
});

/** Send one request with the Host header a rebound browser would write. */
function send(
  port: number,
  init: { method: string; host: string; headers?: Record<string, string>; body?: string },
) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: "/api/request?_s=api&_m=me",
        method: init.method,
        headers: { host: init.host, ...init.headers },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end(init.body);
  });
}

describe("every HTTP entry point", () => {
  let upstream: Upstream;
  let server: Server | undefined;

  beforeEach(async () => {
    vi.stubEnv("NODE_ENV", "development");
    upstream = await startUpstream(echo);
    const { endpoint } = courier();
    registerSources({
      api: defineApi({ baseURL: upstream.url, endpoints: { me: endpoint.get("me") } }),
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    _resetSourcesForTests();
    server?.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    await upstream.close();
  });

  async function serve(config?: HandlerConfig): Promise<number> {
    const handler = createHandler(config);
    server = createServer(async (req, res) => {
      await sendWebResponse(await handler.handle(toWebRequest(req, res)), res);
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    return (server.address() as AddressInfo).port;
  }

  it.each([
    ["GET", {}],
    ["POST", { "content-type": "application/json" }],
    ["SSE", { accept: "text/event-stream" }],
    ["OPTIONS", { origin: "http://rebound.example", "access-control-request-method": "POST" }],
  ] as const)("answers %s for a host the app does not serve with 421", async (kind, headers) => {
    const port = await serve();

    const answer = await send(port, {
      method: kind === "SSE" ? "GET" : kind,
      host: `rebound.example:${port}`,
      headers,
      body: kind === "POST" ? JSON.stringify({ variables: {} }) : undefined,
    });

    expect(answer.status).toBe(421);
    expect(JSON.parse(answer.body)).toMatchObject({ success: false, code: "HOST_NOT_ALLOWED" });
    expect(JSON.parse(answer.body).message).toContain("allowedHosts");
    expect(upstream.received).toHaveLength(0);
  });

  it("serves the app's own loopback name", async () => {
    const port = await serve();

    const answer = await send(port, { method: "GET", host: `localhost:${port}` });

    expect(answer.status).toBe(200);
    expect(upstream.received).toHaveLength(1);
  });

  it("serves a name allowedHosts lists", async () => {
    const port = await serve({ allowedHosts: ["app.example.com"] });

    const listed = await send(port, { method: "GET", host: "app.example.com" });
    const rebound = await send(port, { method: "GET", host: "rebound.example" });

    expect(listed.status).toBe(200);
    expect(rebound.status).toBe(421);
  });
});
