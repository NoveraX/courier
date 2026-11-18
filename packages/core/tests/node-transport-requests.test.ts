/**
 * The WebSocket handler's HTTP transport on a Node server shared with the
 * application: its requests are taken ahead of every handler the
 * application gives the server, added before the attach or after it, so
 * none of them answers one a second time; every other request is the
 * application's, and is again once the handler is detached.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { createWSHandler } from "../src/adapter/handle-ws";
import type { WSHandler } from "../src/adapter/ws-types";
import { attachWebSocketUpgrade, type UpgradeServer } from "../src/node";
import { HTTP_TRANSPORT_VERSION } from "../src/realtime/ws/http-protocol";
import { encodeMessage } from "../src/realtime/ws/ws-protocol";
import { _resetSourcesForTests, registerSources } from "../src/server/sources";
import { authFrame } from "./helpers/fake-socket";
import { eventsOf } from "./helpers/http-client";

let server: Server | undefined;
const handlers: WSHandler[] = [];

afterEach(async () => {
  await Promise.all(handlers.splice(0).map((handler) => handler.destroy({ timeoutMs: 100 })));
  _resetSourcesForTests();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

/** A server whose application answers every request it sees with a 404 of its own. */
async function serving(path: string | undefined) {
  registerSources({});
  const handler = createWSHandler({ onConnect: () => ({}) });
  handlers.push(handler);
  const app = vi.fn((_req: IncomingMessage, res: ServerResponse) => res.writeHead(404).end("app"));
  const late = vi.fn();
  server = createServer(app);
  const detach = attachWebSocketUpgrade(server, {
    path,
    createServer: (options) => new WebSocketServer(options) as unknown as UpgradeServer,
    onSocket: (socket, request) => handler.handleSocket(socket, request),
    onHTTP: (request, peer) => handler.handleHTTP(request, peer),
  });
  server.on("request", late);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, app, late, detach };
}

const opening = [
  JSON.stringify({ op: "poll", v: HTTP_TRANSPORT_VERSION }),
  encodeMessage(authFrame()),
].join("\n");

function postTo(url: string, body: string, type = "text/plain;charset=UTF-8"): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "content-type": type }, body });
}

describe("attachWebSocketUpgrade({ onHTTP })", () => {
  it("takes the transport's POST to the socket's path ahead of the application's handlers", async () => {
    const { origin, app, late } = await serving("/api/ws");

    const taken = await postTo(`${origin}/api/ws`, opening);
    const events = await eventsOf(taken).rest();
    const others = await Promise.all([fetch(`${origin}/api/ws`), postTo(`${origin}/api`, opening)]);

    expect(taken.status).toBe(200);
    expect(events.map((event) => event.event ?? JSON.parse(event.data).type)).toEqual([
      "open",
      "auth_ok",
    ]);
    expect(others.map((response) => response.status)).toEqual([404, 404]);
    expect(app).toHaveBeenCalledTimes(2);
    expect(late).toHaveBeenCalledTimes(2);
  });

  it("takes, on a server that hosts nothing but Courier, the POSTs whose body is text/plain", async () => {
    const { origin, app } = await serving(undefined);

    const taken = await postTo(`${origin}/anywhere`, opening);
    await eventsOf(taken).rest();
    const proxied = await postTo(`${origin}/api/request`, "{}", "application/json");

    expect([taken.status, proxied.status]).toEqual([200, 404]);
    expect(app).toHaveBeenCalledTimes(1);
  });

  it("leaves the transport's requests to the application once detached", async () => {
    const { origin, app, detach } = await serving("/api/ws");

    detach();
    const response = await postTo(`${origin}/api/ws`, opening);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("app");
    expect(app).toHaveBeenCalledTimes(1);
  });
});
