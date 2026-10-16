/**
 * The app's origin, learned from a request a Hono route serves, from what
 * the runtime serving Hono tells of the server itself: the socket
 * `@hono/node-server` hands over as `env.incoming`, or the address Bun's
 * server listens on. The request's Host decides nothing; Deno and
 * Cloudflare Workers tell no address, so nothing is learned there.
 */
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { serve, upgradeWebSocket, type WebSocketServerLike } from "@hono/node-server";
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { Hono } from "hono";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { courierHandler, courierSSEHandler, courierWSHandler } from "../src/index";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });
const app = new Hono();
app.all("/api/request", courierHandler({ sources: { api } }));

const send = (host: string, env: object) =>
  app.request("http://localhost/api/request?_s=api&_m=ping", { headers: { host } }, env);
/* What @hono/node-server passes as `env`: the Node request and its socket. */
const nodeServer = (localAddress: string, localPort: number) => ({
  incoming: { socket: { localAddress, localPort, remoteAddress: "203.0.113.9" } },
});
/* What Bun passes as `env`: its server, which answers `requestIP()` and knows its URL. */
const bunServer = (url: string) => ({ requestIP: () => ({ address: "::1" }), url: new URL(url) });

afterEach(() => {
  setAppOrigin(undefined);
});

describe("a Hono route learning the app's origin", () => {
  it("learns the address of the socket @hono/node-server accepted the request on, whatever Host it names", async () => {
    await send("evil.example:4444", nodeServer("127.0.0.1", 8787));

    expect(getAppOrigin()).toBe("http://localhost:8787");
  });

  it("learns a container's or a network address as it is", async () => {
    await send("localhost:8787", nodeServer("172.17.0.2", 8787));

    expect(getAppOrigin()).toBe("http://172.17.0.2:8787");
  });

  it("learns the address Bun's server listens on, every interface named localhost", async () => {
    await send("evil.example", bunServer("http://0.0.0.0:3000/"));
    expect(getAppOrigin()).toBe("http://localhost:3000");

    setAppOrigin(undefined);
    await send("evil.example", bunServer("https://192.168.1.20:3443/"));
    expect(getAppOrigin()).toBe("https://192.168.1.20:3443");
  });

  it("learns nothing where the runtime tells no address — Deno, Workers — whatever Host it names", async () => {
    await send("localhost:8000", { remoteAddr: { hostname: "127.0.0.1" } });
    await send("localhost:3000", {});

    expect(getAppOrigin()).toBeUndefined();
  });
});

/* A real @hono/node-server serving Courier's three routes, as an app on Node does. */
async function serveOnNode(): Promise<number> {
  const real = new Hono();
  real.all("/api/request", courierHandler({ sources: { api } }));
  real.get("/api/sse", courierSSEHandler({ sources: { api } }));
  const ws = courierWSHandler();
  real.get(
    "/api/ws",
    upgradeWebSocket((c) => ws(c)),
  );
  const wss = new WebSocketServer({ noServer: true });
  const server = serve({
    fetch: real.fetch,
    port: 0,
    hostname: "127.0.0.1",
    websocket: { server: asHonoServer(wss) },
  });
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  onTestFinished(
    () =>
      new Promise<void>((resolve) => {
        wss.close();
        server.close(() => resolve());
      }),
  );
  return (server.address() as AddressInfo).port;
}

function sendTo(port: number, path: string, host: string): Promise<void> {
  return new Promise((resolve) => {
    const sent = request({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
      res.resume();
      res.on("end", () => resolve());
    });
    sent.on("error", () => resolve());
    sent.end();
  });
}

/* A WebSocket upgrade from this machine under whatever Host it names, closed once it is answered. */
function upgradeOnce(port: number, host: string): Promise<void> {
  return new Promise((resolve) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}/api/ws`, { headers: { host } });
    const done = () => {
      client.terminate();
      resolve();
    };
    client.once("open", done);
    client.once("unexpected-response", done);
    client.once("error", done);
  });
}

function asHonoServer(wss: WebSocketServer): WebSocketServerLike {
  // @ts-expect-error — the declarations differ only in `| undefined`
  return wss;
}

describe("Hono on a real @hono/node-server learning the app's origin", () => {
  it("learns the server's own address from a call, whatever Host it names", async () => {
    const port = await serveOnNode();

    await sendTo(port, "/api/request?_s=api&_m=ping", "evil.example:4444");

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
  });

  it("learns the same from a stream's route", async () => {
    const port = await serveOnNode();

    await sendTo(port, "/api/sse?_s=api&_m=ping", "evil.example:4444");

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
  });

  it("learns the same from a WebSocket's upgrade", async () => {
    const port = await serveOnNode();

    await upgradeOnce(port, "evil.example:4444");

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
  });
});
