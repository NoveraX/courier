/**
 * The app's origin, learned from a request the Express route serves: the
 * address and port of the socket the server accepted it on, whatever Host
 * or X-Forwarded-Host the request names.
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
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { WebSocket } from "ws";

import { courierHandler, courierWSAttach } from "../src/index";

/* A source whose endpoint no mark opens: the call is refused before anything is sent. */
const { endpoint } = courier();
const api = defineApi({ baseURL: "http://127.0.0.1:9", endpoints: { ping: endpoint.get("ping") } });
const handler = courierHandler({ sources: { api } });

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
function sendTo(port: number, headers: Record<string, string>): Promise<void> {
  return new Promise((resolve) => {
    const sent = request(
      { host: "127.0.0.1", port, path: "/api/request?_s=api&_m=ping", headers },
      (res) => {
        res.resume();
        res.on("end", () => resolve());
      },
    );
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

describe("Express learning the app's origin", () => {
  it("learns the address of the socket the server accepted the request on", async () => {
    const port = await serve((req, res) => void handler(req, res));

    await sendTo(port, { host: `localhost:${port}` });

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
  });

  it("learns the same address whatever Host, or X-Forwarded-Host, the request names", async () => {
    const port = await serve((req, res) => void handler(req, res));

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

  it("learns the same from a WebSocket's upgrade, whatever Host it names", async () => {
    app = createServer();
    const detach = courierWSAttach(app);
    onTestFinished(detach);
    await new Promise<void>((resolve) => app?.listen(0, "127.0.0.1", resolve));
    const { port } = app.address() as AddressInfo;

    await upgradeOnce(port, "evil.example:4444");

    expect(getAppOrigin()).toBe(`http://localhost:${port}`);
  });
});
