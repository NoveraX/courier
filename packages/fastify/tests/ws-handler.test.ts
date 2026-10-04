/**
 * `courierWSHandler` and the `@fastify/websocket` server it runs on.
 *
 * Without the plugin, Fastify calls the handler as an ordinary route with a
 * request and a reply, so the handler answers with an error that names the
 * missing plugin — not a 500 "Cannot read properties of undefined (reading
 * 'host')". With it, frames are buffered by the plugin's `ws` server, whose
 * default limit is 100 MiB, before `maxMessageSize` is consulted — the
 * Express and Nest adapters refuse a larger frame before reading it — so the
 * handler warns when that limit is far above any message it takes.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { registerSources } from "@noverax/courier";
import { defineApi } from "@noverax/courier/define";
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type RouteHandlerMethod,
  type RouteShorthandOptions,
} from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { courierWSHandler } from "../src";

let app: FastifyInstance | undefined;
let server: Server | undefined;

beforeEach(() => {
  registerSources({ api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

describe("courierWSHandler without @fastify/websocket", () => {
  it("answers with an error that names the missing plugin", async () => {
    app = Fastify();
    /* The option and the handler shape exist only in the plugin's types, absent here
       as they are in an app that never installed it. */
    const websocketRoute: RouteShorthandOptions & { websocket: boolean } = { websocket: true };
    app.get("/api/ws", websocketRoute, courierWSHandler() as unknown as RouteHandlerMethod);
    const origin = await app.listen({ port: 0, host: "127.0.0.1" });

    const response = await fetch(`${origin}/api/ws`);
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(500);
    expect(body.message).toMatch(/@fastify\/websocket/);
  });
});

/**
 * Hand the handler what `@fastify/websocket` hands it: a socket its `ws`
 * server accepted, and the request, whose `server` carries that `ws` server.
 */
async function connectThrough(wss: WebSocketServer, handler: ReturnType<typeof courierWSHandler>) {
  server = createServer();
  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const request = { raw: req, server: { websocketServer: wss } } as unknown as FastifyRequest;
      handler(ws, request);
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const client = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/ws`);
  await new Promise((resolve) => client.once("open", resolve));
  client.close();
}

describe("courierWSHandler under the plugin's frame limit", () => {
  it("warns when the plugin's server reads frames far larger than any message it takes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const wss = new WebSocketServer({ noServer: true });

    await connectThrough(wss, courierWSHandler({ maxMessageSize: 1000 }));

    const call = warn.mock.calls.find((args) => String(args[1]).includes("maxPayload"));
    expect(call).toBeDefined();
    expect(String(call?.[1])).toMatch(/1000/);
    wss.close();
  });

  it("stays quiet when the plugin refuses larger frames itself", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const wss = new WebSocketServer({ noServer: true, maxPayload: 1000 });

    await connectThrough(wss, courierWSHandler({ maxMessageSize: 1000 }));

    expect(warn.mock.calls.some((args) => String(args[1]).includes("maxPayload"))).toBe(false);
    wss.close();
  });
});

describe("the metadata the handler's hooks receive", () => {
  it("is typed from what onConnect returns", () => {
    const handler = courierWSHandler({
      onConnect: () => ({ userId: "u1" }),
      authorize: ({ meta }) => meta.userId.length > 0,
    });

    expect(handler).toBeTypeOf("function");
  });
});
