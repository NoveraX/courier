/**
 * The app's origin, learned from a request a real Fastify app's Courier
 * route serves: the address and port of the socket the server accepted it
 * on, whatever Host or X-Forwarded-Host the request names.
 */
import { createServer, type IncomingMessage, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { courierPlugin, courierSSEHandler, courierWSHandler } from "../src/index";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });

let app: FastifyInstance | undefined;

afterEach(async () => {
  setAppOrigin(undefined);
  await app?.close();
  app = undefined;
});

async function serve(): Promise<number> {
  app = Fastify();
  await app.register(courierPlugin, { config: { sources: { api } } });
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  return Number(new URL(address).port);
}

/* A request from this machine to the server, under whatever Host it names. */
function sendTo(
  port: number,
  headers: Record<string, string>,
  path = "/api/request?_s=api&_m=ping",
): Promise<void> {
  return new Promise((resolve) => {
    const sent = request({ host: "127.0.0.1", port, path, headers }, (res) => {
      res.resume();
      res.on("end", () => resolve());
    });
    sent.on("error", () => resolve());
    sent.end();
  });
}

describe("Fastify learning the app's origin", () => {
  it("learns the address of the socket the server accepted the request on", async () => {
    const port = await serve();

    await sendTo(port, { host: `localhost:${port}` });

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
  });

  it("learns the same address whatever Host, or X-Forwarded-Host, the request names", async () => {
    const port = await serve();

    for (const headers of [
      { host: "evil.example:4444" },
      { host: "localhost:7990" },
      { host: `localhost:${port}`, "x-forwarded-host": "evil.example" },
    ]) {
      setAppOrigin(undefined);
      await sendTo(port, headers);

      expect(getAppOrigin()).toBe(`http://localhost:${port}`);
    }
  });

  it("learns the same from a stream's route, whatever Host it names", async () => {
    app = Fastify();
    app.get("/api/sse", courierSSEHandler({ sources: { api } }));
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const port = Number(new URL(address).port);

    await sendTo(port, { host: "evil.example:4444" }, "/api/sse?_s=api&_m=ping");

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
  });

  it("learns the same from a WebSocket @fastify/websocket hands the handler", async () => {
    const port = await serveWebSockets();

    await upgradeOnce(port, "evil.example:4444");

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
  });
});

/* What @fastify/websocket does: its `ws` server accepts the socket and hands it on with the request. */
async function serveWebSockets(): Promise<number> {
  const wss = new WebSocketServer({ noServer: true });
  const handler = courierWSHandler();
  const server: Server = createServer();
  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const fastifyRequest = {
        raw: req,
        server: { websocketServer: wss },
      } as unknown as FastifyRequest;
      handler(ws, fastifyRequest);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(
    () =>
      new Promise<void>((resolve) => {
        wss.close();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  return (server.address() as AddressInfo).port;
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
