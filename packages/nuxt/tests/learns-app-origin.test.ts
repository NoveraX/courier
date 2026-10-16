/**
 * The app's origin, learned from a request a Nuxt route serves: the address
 * and port of the Node socket under the event — h3 1.x's Node request, as
 * Nuxt 3 and 4 hand it over, or the one h3 2.x's request carries on Node —
 * whatever Host the request names. Under `nuxt dev` the request reaches
 * Nitro's worker on a channel whose socket tells no address: nothing is
 * learned there, and Studio's Nuxt module names the dev server instead.
 */
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { getAppOrigin, setAppOrigin } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterEach, describe, expect, it } from "vitest";

import type { H3EventLike } from "../src/h3-event";
import { courierHandler } from "../src/index";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });
const handler = courierHandler({ sources: { api } });

let server: Server | undefined;

afterEach(async () => {
  setAppOrigin(undefined);
  const listening = server;
  server = undefined;
  if (listening) await new Promise<void>((resolve) => listening.close(() => resolve()));
});

/* A Node server that hands each request to the route as an h3 1.x event, as Nitro on Node does. */
async function serveH3NodeEvents(): Promise<number> {
  server = createServer((req, res) => {
    void handler({ node: { req, res } })
      .then(async (response) => {
        res.writeHead(response.status);
        res.end(await response.text());
      })
      .catch(() => res.end());
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

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

/* An h3 2.x event on Node: its request carries the Node request, and so its socket. */
function webEvent(host: string, socket: object): H3EventLike {
  const req = new Request("http://localhost/api/request?_s=api&_m=ping", { headers: { host } });
  Object.assign(req, { ip: "::1", runtime: { node: { req: { socket } } } });
  return { req };
}

describe("a Nuxt route learning the app's origin", () => {
  it("learns the address of the socket an h3 1.x event's request arrived on, whatever Host it names", async () => {
    const port = await serveH3NodeEvents();

    await sendTo(port, "evil.example:4444");

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
  });

  it("learns the address of the socket under an h3 2.x event's request", async () => {
    await handler(webEvent("evil.example", { localAddress: "127.0.0.1", localPort: 3000 })).catch(
      () => undefined,
    );

    expect(getAppOrigin()).toBe("http://localhost:3000");
  });

  it("learns nothing from a socket that tells no address, as under nuxt dev's worker", async () => {
    await handler(webEvent("localhost:3000", {})).catch(() => undefined);

    expect(getAppOrigin()).toBeUndefined();
  });
});
