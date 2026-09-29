/**
 * Subscribe, unsubscribe and auth frames against a flood. They were exempt
 * from the per-connection rate limit, with no limit of their own, so one
 * socket could send them without end — each an auth check, a schema read or
 * a registry change on the server. They are now counted apart from the
 * other messages, up to twice `maxSubscriptionsPerConnection` a second: a
 * client that renews every subscription at once is never refused.
 */
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { decodeMessage, encodeMessage, type WSMessage } from "../src/realtime/ws/ws-protocol";
import { type ServedWS, serveWS, settle, stopWS } from "./helpers/ws-server";

let served: ServedWS | undefined;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await stopWS(served);
  served = undefined;
});

interface Client {
  send(message: WSMessage): void;
  received: WSMessage[];
}

async function connect(maxSubscriptionsPerConnection: number): Promise<Client> {
  served = await serveWS({}, { maxSubscriptionsPerConnection });
  const socket = new WebSocket(served.url);
  sockets.push(socket);
  const received: WSMessage[] = [];
  socket.on("message", (data) => received.push(decodeMessage(String(data))));
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return { send: (message) => socket.send(encodeMessage(message)), received };
}

function rateLimited(client: Client): WSMessage[] {
  return client.received.filter((m) => m.type === "error" && m.error?.message === "Rate limited");
}

describe("control frames", () => {
  it("are refused past twice the subscription cap in a second", async () => {
    const client = await connect(5);

    for (let i = 0; i < 30; i += 1)
      client.send({ type: "subscribe", id: `s${i}`, topic: `api.live.none#${i}` });
    await settle(100);

    expect(rateLimited(client).map((m) => m.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => `s${i + 10}`),
    );
  });

  it("count auth refreshes too", async () => {
    const client = await connect(5);

    for (let i = 0; i < 15; i += 1) client.send({ type: "auth", payload: `token-${i}` });
    await settle(100);

    expect(rateLimited(client)).toHaveLength(5);
  });

  it("let a client renew every subscription at once", async () => {
    const client = await connect(5);

    for (let i = 0; i < 5; i += 1)
      client.send({ type: "unsubscribe", topic: `api.live.none#${i}` });
    for (let i = 0; i < 5; i += 1)
      client.send({ type: "subscribe", id: `s${i}`, topic: `api.live.none#${i}` });
    await settle(100);

    expect(rateLimited(client)).toEqual([]);
  });

  it("are not held back by a flood of other messages", async () => {
    const client = await connect(5);

    for (let i = 0; i < 150; i += 1)
      client.send({ type: "message", topic: "api.live.none", payload: i });
    client.send({ type: "subscribe", id: "after", topic: "api.live.none#after" });
    await settle(100);

    expect(rateLimited(client).map((m) => m.id)).not.toContain("after");
  });
});
