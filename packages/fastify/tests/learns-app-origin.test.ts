/**
 * The app's origin, learned from a request the Fastify route serves: a Host
 * of this machine's on the port the server accepted it on teaches it, a
 * Host on another port teaches nothing.
 */
import {
  createServer,
  type IncomingMessage,
  request,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { courierPlugin } from "../src/index";

type Route = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/* The route the plugin registers, taken from a stand-in that records it. */
async function routeOf(): Promise<Route> {
  let route: Route | undefined;
  const stand = {
    all: (_path: string, handler: Route) => {
      route = handler;
    },
    addHook: () => undefined,
    removeAllContentTypeParsers: () => undefined,
    addContentTypeParser: () => undefined,
  };
  /* A source whose endpoint no mark opens: the call is refused before anything is sent. */
  const { endpoint } = courier();
  const api = defineApi({
    baseURL: "http://127.0.0.1:9",
    endpoints: { ping: endpoint.get("ping") },
  });
  await courierPlugin(stand as unknown as FastifyInstance, { config: { sources: { api } } });
  if (route === undefined) throw new Error("the plugin registered no route");
  return route;
}

const route = await routeOf();
const served = (req: IncomingMessage, res: ServerResponse) =>
  void route({ raw: req } as FastifyRequest, { raw: res, hijack: () => undefined } as never);

let app: Server | undefined;

afterEach(async () => {
  setAppOrigin(undefined);
  app?.closeAllConnections();
  await new Promise<void>((resolve) => (app ? app.close(() => resolve()) : resolve()));
  app = undefined;
});

async function serve(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<number> {
  app = createServer(handler);
  await new Promise<void>((resolve) => app?.listen(0, "127.0.0.1", resolve));
  return (app.address() as AddressInfo).port;
}

/* A request from this machine to the server, under whatever Host it names. */
function sendTo(port: number, host: string): Promise<void> {
  return new Promise((resolve) => {
    const sent = request(
      { host: "127.0.0.1", port, path: "/api/request?_s=api&_m=ping", headers: { host } },
      (res) => {
        res.resume();
        res.on("end", () => resolve());
      },
    );
    sent.on("error", () => resolve());
    sent.end();
  });
}

describe("Fastify learning the app's origin", () => {
  it("learns this machine's names on the port the server accepted the request on", async () => {
    const port = await serve(served);

    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]) {
      setAppOrigin(undefined);
      await sendTo(port, host);

      expect(getAppOrigin()).toBe(`http://${host}`);
    }
  });

  it("learns nothing from a Host on another port of this machine", async () => {
    const port = await serve(served);

    await sendTo(port, "localhost:7990");
    await sendTo(port, "evil.example");

    expect(getAppOrigin()).toBeUndefined();
  });
});
